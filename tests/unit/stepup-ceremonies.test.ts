import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetConfigCache } from "@/server/config/index";
import { openSqliteStore } from "@/server/db/drivers";
import type { ConsoleStore } from "@/server/db/store";
import {
  beginRegistration,
  beginStepUp,
  finishRegistration,
  finishStepUp,
  type CeremonyFailure,
} from "@/server/stepup/ceremonies";
import { insertPasskey } from "@/server/store/passkeys";

/**
 * The WebAuthn ceremonies' refusals.
 *
 * The happy path needs a real authenticator, and the test that walks it drives
 * Chromium's virtual one from Playwright. What is worth pinning here is
 * everything the console says no to, because each of those is a decision the
 * WebAuthn specification leaves to the relying party and none of them is visible
 * from a successful run.
 *
 * These run on SQLite alone. `store-repositories.test.ts` already holds the two
 * dialects to the same behaviour, so repeating that here would cost a second
 * Postgres boot to prove something already proved.
 */

const OPERATOR = "operator-1";
const AT = new Date("2026-10-07T12:00:00.000Z");

let store: ConsoleStore;
let dir: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  process.env.CSAX_API_URL = "http://127.0.0.1:8080";
  process.env.CSAX_SESSION_SECRET = Buffer.alloc(32, 1).toString("base64");
  process.env.CSAX_VAULT_KEY = Buffer.alloc(32, 2).toString("base64");
  process.env.WEBAUTHN_RP_ID = "localhost";
  process.env.WEBAUTHN_ORIGIN = "http://localhost:3000";
  delete process.env.WEBAUTHN_RP_NAME;
  resetConfigCache();

  dir = mkdtempSync(join(tmpdir(), "csax-ceremony-"));
  store = openSqliteStore(join(dir, "console.sqlite"));
  await store.migrate();
});

afterEach(async () => {
  await store.close();
  rmSync(dir, { recursive: true, force: true });
  process.env = { ...savedEnv };
  resetConfigCache();
});

async function enrol(credentialId: string, operatorId = OPERATOR): Promise<void> {
  await insertPasskey(store.driver, {
    operatorId,
    credentialId,
    publicKey: new Uint8Array([1, 2, 3, 4]),
    counter: 0,
    transports: ["internal"],
    deviceName: "Test key",
    backedUp: false,
    at: AT,
  });
}

/** An answer that is shaped like an authenticator's and is not one. */
const GARBAGE_REGISTRATION = {
  id: "AAAA",
  rawId: "AAAA",
  type: "public-key" as const,
  clientExtensionResults: {},
  response: { clientDataJSON: "AAAA", attestationObject: "AAAA" },
};

const GARBAGE_ASSERTION = {
  id: "AAAA",
  rawId: "AAAA",
  type: "public-key" as const,
  clientExtensionResults: {},
  response: { clientDataJSON: "AAAA", authenticatorData: "AAAA", signature: "AAAA" },
};

/** The failure a ceremony refused with, or a thrown error saying it did not. */
async function refusal(run: () => Promise<unknown>): Promise<CeremonyFailure> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error && error.name === "CeremonyError") {
      return (error as Error & { failure: CeremonyFailure }).failure;
    }
    throw error;
  }
  throw new Error("the ceremony was expected to refuse and did not");
}

describe("beginRegistration", () => {
  it("asks for a passkey on the configured relying party", async () => {
    const offer = await beginRegistration(store.driver, {
      operatorId: OPERATOR,
      label: "ops@example.test",
      at: AT,
    });

    expect(offer.options.rp.id).toBe("localhost");
    expect(offer.options.rp.name).toBe("csax+ console");
    expect(offer.options.challenge).not.toBe("");
    expect(offer.options.user.name).toBe("ops@example.test");
    expect(offer.challengeId).not.toBe("");
  });

  it("gives an operator one stable user handle and two operators different ones", async () => {
    const first = await beginRegistration(store.driver, {
      operatorId: OPERATOR,
      label: "ops@example.test",
      at: AT,
    });
    const again = await beginRegistration(store.driver, {
      operatorId: OPERATOR,
      label: "ops@example.test",
      at: AT,
    });
    const other = await beginRegistration(store.driver, {
      operatorId: "operator-2",
      label: "other@example.test",
      at: AT,
    });

    // The handle is what the authenticator stores to tell accounts apart on one
    // device, so it has to be the same every time for one operator and never
    // shared between two.
    expect(again.options.user.id).toBe(first.options.user.id);
    expect(other.options.user.id).not.toBe(first.options.user.id);
  });

  it("keeps a handle inside the 64 bytes the specification allows", async () => {
    // The API's operator id is whatever the engine chose and could be long. The
    // handle is a digest, so it is 32 bytes however long the id is.
    const offer = await beginRegistration(store.driver, {
      operatorId: "x".repeat(500),
      label: "ops@example.test",
      at: AT,
    });

    // base64url of 32 bytes is 43 characters, with no padding.
    expect(offer.options.user.id.length).toBe(43);
  });

  it("excludes the credentials the operator already holds", async () => {
    await enrol("cred-1");
    await enrol("cred-2");

    const offer = await beginRegistration(store.driver, {
      operatorId: OPERATOR,
      label: "ops@example.test",
      at: AT,
    });

    // Enrolling one authenticator twice would leave two rows counting the same
    // signature counter, which is the thing clone detection rests on.
    expect(offer.options.excludeCredentials?.map((credential) => credential.id).sort()).toEqual([
      "cred-1",
      "cred-2",
    ]);
  });

  it("does not exclude another operator's credentials", async () => {
    await enrol("theirs", "operator-2");

    const offer = await beginRegistration(store.driver, {
      operatorId: OPERATOR,
      label: "ops@example.test",
      at: AT,
    });

    expect(offer.options.excludeCredentials).toEqual([]);
  });
});

describe("finishRegistration", () => {
  it("refuses a challenge it never issued", async () => {
    expect(
      await refusal(() =>
        finishRegistration(store.driver, {
          operatorId: OPERATOR,
          challengeId: "11111111-1111-4111-8111-111111111111",
          response: GARBAGE_REGISTRATION,
          deviceName: "Test key",
          at: AT,
        }),
      ),
    ).toBe("challenge");
  });

  it("refuses a challenge it issued to another operator", async () => {
    const offer = await beginRegistration(store.driver, {
      operatorId: OPERATOR,
      label: "ops@example.test",
      at: AT,
    });

    expect(
      await refusal(() =>
        finishRegistration(store.driver, {
          operatorId: "operator-2",
          challengeId: offer.challengeId,
          response: GARBAGE_REGISTRATION,
          deviceName: "Test key",
          at: AT,
        }),
      ),
    ).toBe("challenge");
  });

  it("refuses a challenge that was issued for a step-up", async () => {
    await enrol("cred-1");
    const offer = await beginStepUp(store.driver, { operatorId: OPERATOR, at: AT });

    expect(
      await refusal(() =>
        finishRegistration(store.driver, {
          operatorId: OPERATOR,
          challengeId: offer.challengeId,
          response: GARBAGE_REGISTRATION,
          deviceName: "Test key",
          at: AT,
        }),
      ),
    ).toBe("challenge-kind");
  });

  it("refuses an answer that is not a credential", async () => {
    const offer = await beginRegistration(store.driver, {
      operatorId: OPERATOR,
      label: "ops@example.test",
      at: AT,
    });

    // The library throws on input it cannot decode rather than answering false,
    // and a broken client should get a refusal rather than a 500.
    expect(
      await refusal(() =>
        finishRegistration(store.driver, {
          operatorId: OPERATOR,
          challengeId: offer.challengeId,
          response: GARBAGE_REGISTRATION,
          deviceName: "Test key",
          at: AT,
        }),
      ),
    ).toBe("verification");
  });

  it("will not take the same registration challenge twice", async () => {
    const offer = await beginRegistration(store.driver, {
      operatorId: OPERATOR,
      label: "ops@example.test",
      at: AT,
    });

    const attempt = () =>
      finishRegistration(store.driver, {
        operatorId: OPERATOR,
        challengeId: offer.challengeId,
        response: GARBAGE_REGISTRATION,
        deviceName: "Test key",
        at: AT,
      });

    // The first attempt fails on the answer, but it still spent the challenge.
    expect(await refusal(attempt)).toBe("verification");
    expect(await refusal(attempt)).toBe("challenge");
  });

  it("refuses a challenge that has expired", async () => {
    const offer = await beginRegistration(store.driver, {
      operatorId: OPERATOR,
      label: "ops@example.test",
      at: AT,
    });

    expect(
      await refusal(() =>
        finishRegistration(store.driver, {
          operatorId: OPERATOR,
          challengeId: offer.challengeId,
          response: GARBAGE_REGISTRATION,
          deviceName: "Test key",
          at: new Date(AT.getTime() + 61_000),
        }),
      ),
    ).toBe("challenge");
  });
});

describe("beginStepUp", () => {
  it("refuses an operator who has no passkey to step up with", async () => {
    expect(
      await refusal(() => beginStepUp(store.driver, { operatorId: OPERATOR, at: AT })),
    ).toBe("no-passkey");
  });

  it("offers exactly the credentials that operator holds", async () => {
    await enrol("cred-1");
    await enrol("cred-2");
    await enrol("theirs", "operator-2");

    const offer = await beginStepUp(store.driver, { operatorId: OPERATOR, at: AT });

    expect(offer.options.rpId).toBe("localhost");
    expect(offer.options.allowCredentials?.map((credential) => credential.id).sort()).toEqual([
      "cred-1",
      "cred-2",
    ]);
  });

  it("asks the authenticator to verify the person, not just their presence", async () => {
    await enrol("cred-1");

    const offer = await beginStepUp(store.driver, { operatorId: OPERATOR, at: AT });

    // "preferred" would let an authenticator unlock nothing and still count,
    // which would make the second factor no factor at all.
    expect(offer.options.userVerification).toBe("required");
  });
});

describe("finishStepUp", () => {
  it("refuses a credential this console never enrolled", async () => {
    await enrol("cred-1");
    const offer = await beginStepUp(store.driver, { operatorId: OPERATOR, at: AT });

    expect(
      await refusal(() =>
        finishStepUp(store.driver, {
          operatorId: OPERATOR,
          challengeId: offer.challengeId,
          response: GARBAGE_ASSERTION,
          at: AT,
        }),
      ),
    ).toBe("credential-unknown");
  });

  it("refuses a credential that belongs to another operator", async () => {
    await enrol("cred-1");
    await enrol("theirs", "operator-2");
    const offer = await beginStepUp(store.driver, { operatorId: OPERATOR, at: AT });

    expect(
      await refusal(() =>
        finishStepUp(store.driver, {
          operatorId: OPERATOR,
          challengeId: offer.challengeId,
          response: { ...GARBAGE_ASSERTION, id: "theirs", rawId: "theirs" },
          at: AT,
        }),
      ),
    ).toBe("credential-owner");
  });

  it("refuses a challenge that was issued for a registration", async () => {
    const offer = await beginRegistration(store.driver, {
      operatorId: OPERATOR,
      label: "ops@example.test",
      at: AT,
    });

    expect(
      await refusal(() =>
        finishStepUp(store.driver, {
          operatorId: OPERATOR,
          challengeId: offer.challengeId,
          response: GARBAGE_ASSERTION,
          at: AT,
        }),
      ),
    ).toBe("challenge-kind");
  });

  it("refuses an assertion that does not check out", async () => {
    await enrol("cred-1");
    const offer = await beginStepUp(store.driver, { operatorId: OPERATOR, at: AT });

    expect(
      await refusal(() =>
        finishStepUp(store.driver, {
          operatorId: OPERATOR,
          challengeId: offer.challengeId,
          response: { ...GARBAGE_ASSERTION, id: "cred-1", rawId: "cred-1" },
          at: AT,
        }),
      ),
    ).toBe("verification");
  });

  it("will not take the same step-up challenge twice", async () => {
    await enrol("cred-1");
    const offer = await beginStepUp(store.driver, { operatorId: OPERATOR, at: AT });

    const attempt = () =>
      finishStepUp(store.driver, {
        operatorId: OPERATOR,
        challengeId: offer.challengeId,
        response: { ...GARBAGE_ASSERTION, id: "cred-1", rawId: "cred-1" },
        at: AT,
      });

    expect(await refusal(attempt)).toBe("verification");
    expect(await refusal(attempt)).toBe("challenge");
  });
});
