import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DELETE as deletePasskeyRoute } from "@/app/api/console/passkeys/[passkeyId]/route";
import { POST as addPasskeyRoute } from "@/app/api/console/passkeys/options/route";
import { GET as listPasskeysRoute } from "@/app/api/console/passkeys/route";
import { POST as stepUpOptionsRoute } from "@/app/api/console/step-up/options/route";
import { STEP_UP_HEADER } from "@/server/auth/guard";
import { ERROR_CODES } from "@/server/auth/response";
import { SESSION_COOKIE, sealSession, type Session } from "@/server/auth/session";
import { resetConfigCache } from "@/server/config/index";
import { closeConsoleStore, getConsoleStore } from "@/server/db/index";
import { insertPasskey, listPasskeys } from "@/server/store/passkeys";
import { issueGrant } from "@/server/store/grants";

/**
 * The step-up gate, end to end through the route handlers.
 *
 * These call the handlers directly rather than over HTTP, so what is under test
 * is the chain itself: a session, a role that may change something, the origin
 * and CSRF pair, and finally a live grant for the named purpose. Every step is
 * checked here by leaving it out and watching the route refuse.
 *
 * The ceremony that earns a grant is not driven here. It needs a real
 * authenticator, and the Playwright test drives Chromium's virtual one; what
 * this file proves is that a grant, once earned, is honoured exactly once, only
 * by the operator and session it was issued to, and only for the purpose it was
 * issued for.
 */

const ORIGIN = "http://localhost:3000";
const HOST = "localhost:3000";
const CSRF = "the-csrf-value";

let dir: string;
const savedEnv = { ...process.env };

/** A JWT with the given payload. The console never checks the signature. */
function accessToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(claims)}.not-a-real-signature`;
}

function sessionFor(operatorId: string, overrides: Partial<Session> = {}): Session {
  return {
    sid: "sid-1",
    apiSessionId: "api-1",
    operator: { id: operatorId, label: `${operatorId}@example.invalid`, role: "admin" },
    api: {
      accessToken: accessToken({
        sub: operatorId,
        role: "admin",
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
      refreshToken: "refresh",
      // Far enough out that nothing tries to renew, which would need the API.
      expiresAt: Date.now() + 600_000,
    },
    csrf: CSRF,
    ...overrides,
  };
}

async function requestFor(
  session: Session | null,
  init: {
    method?: string;
    csrf?: string | null;
    origin?: string | null;
    host?: string | null;
    grant?: string | null;
    body?: unknown;
  } = {},
): Promise<Request> {
  const headers = new Headers();
  if (session !== null) headers.set("cookie", `${SESSION_COOKIE}=${await sealSession(session)}`);
  headers.set("origin", init.origin === undefined ? ORIGIN : (init.origin ?? ""));
  headers.set("host", init.host === undefined ? HOST : (init.host ?? ""));
  const csrf = init.csrf === undefined ? CSRF : init.csrf;
  if (csrf !== null) headers.set("x-csrf-token", csrf);
  if (init.grant !== undefined && init.grant !== null) headers.set(STEP_UP_HEADER, init.grant);

  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  if (body !== undefined) headers.set("content-type", "application/json");

  return new Request(`${ORIGIN}/api/console/passkeys`, { method: init.method ?? "POST", headers, body });
}

/** The console's error code from an answer, or null if it was a success. */
async function errorCode(response: Response): Promise<string | null> {
  const body = (await response.json()) as { error?: { code?: string } };
  return body.error?.code ?? null;
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "csax-gate-"));
  process.env.CSAX_API_URL = "http://127.0.0.1:8080";
  process.env.CSAX_SESSION_SECRET = Buffer.alloc(32, 1).toString("base64");
  process.env.CSAX_VAULT_KEY = Buffer.alloc(32, 2).toString("base64");
  process.env.WEBAUTHN_RP_ID = "localhost";
  process.env.WEBAUTHN_ORIGIN = ORIGIN;
  process.env.CSAX_STORE_SQLITE_PATH = join(dir, "console.sqlite");
  delete process.env.CSAX_STORE_URL;
  resetConfigCache();
  await closeConsoleStore();
  await getConsoleStore().migrate();
});

afterEach(async () => {
  await closeConsoleStore();
  rmSync(dir, { recursive: true, force: true });
  process.env = { ...savedEnv };
  resetConfigCache();
});

/** Enrols a passkey straight into the store, past the ceremony. */
async function enrol(operatorId: string, credentialId: string): Promise<string> {
  const passkey = await insertPasskey(getConsoleStore().driver, {
    operatorId,
    credentialId,
    publicKey: new Uint8Array([1, 2, 3]),
    counter: 0,
    transports: ["internal"],
    deviceName: "Test key",
    backedUp: false,
    at: new Date(),
  });
  return passkey.id;
}

async function earn(operatorId: string, purpose: "passkey.register" | "passkey.remove") {
  return issueGrant(getConsoleStore().driver, {
    operatorId,
    sessionId: "sid-1",
    purpose,
    at: new Date(),
  });
}

describe("listing passkeys", () => {
  it("answers with the session's own passkeys and no public key", async () => {
    await enrol("operator-1", "cred-1");
    await enrol("operator-2", "cred-2");

    const response = await listPasskeysRoute(await requestFor(sessionFor("operator-1")));
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: { passkeys: Array<Record<string, unknown>> } };
    expect(body.data.passkeys).toHaveLength(1);
    expect(body.data.passkeys[0]?.credentialId).toBe("cred-1");
    // The public key stays on the server: it is what verification is done with,
    // and a browser has no use for it.
    expect(body.data.passkeys[0]).not.toHaveProperty("publicKey");
  });

  it("refuses an anonymous request", async () => {
    const response = await listPasskeysRoute(await requestFor(null));
    expect(response.status).toBe(401);
  });
});

describe("registering a passkey", () => {
  it("lets the first passkey through with no step-up", async () => {
    // Nothing to step up with yet, so requiring a grant here would mean the
    // console's second factor could never be turned on at all.
    const response = await addPasskeyRoute(
      await requestFor(sessionFor("operator-1"), { body: {} }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { challengeId: string; options: { rp: { id: string } } };
    };
    expect(body.data.challengeId).not.toBe("");
    expect(body.data.options.rp.id).toBe("localhost");
  });

  it("refuses a second passkey without a step-up", async () => {
    await enrol("operator-1", "cred-1");

    const response = await addPasskeyRoute(
      await requestFor(sessionFor("operator-1"), { body: {} }),
    );

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe(ERROR_CODES.stepUpRequired);
  });

  it("lets a second passkey through with a grant for registering", async () => {
    await enrol("operator-1", "cred-1");

    const response = await addPasskeyRoute(
      await requestFor(sessionFor("operator-1"), {
        body: {},
        grant: await earn("operator-1", "passkey.register"),
      }),
    );

    expect(response.status).toBe(200);
  });

  it("refuses a grant that was earned for removing", async () => {
    await enrol("operator-1", "cred-1");

    const response = await addPasskeyRoute(
      await requestFor(sessionFor("operator-1"), {
        body: {},
        grant: await earn("operator-1", "passkey.remove"),
      }),
    );

    // The narrower permission must not carry the wider one with it.
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe(ERROR_CODES.stepUpRequired);
  });

  it("refuses a grant earned by another operator", async () => {
    await enrol("operator-1", "cred-1");
    await enrol("operator-2", "cred-2");

    const response = await addPasskeyRoute(
      await requestFor(sessionFor("operator-1"), {
        body: {},
        grant: await earn("operator-2", "passkey.register"),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("refuses a grant earned in another session", async () => {
    await enrol("operator-1", "cred-1");
    const grant = await earn("operator-1", "passkey.register");

    const otherSession = sessionFor("operator-1", { sid: "sid-2" });
    const response = await addPasskeyRoute(
      await requestFor(otherSession, { body: {}, grant }),
    );

    expect(response.status).toBe(403);
  });

  it("spends the grant, so a second request needs a second step-up", async () => {
    await enrol("operator-1", "cred-1");
    const grant = await earn("operator-1", "passkey.register");

    const first = await addPasskeyRoute(
      await requestFor(sessionFor("operator-1"), { body: {}, grant }),
    );
    const second = await addPasskeyRoute(
      await requestFor(sessionFor("operator-1"), { body: {}, grant }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(403);
  });

  it("refuses a request with no CSRF token even with a grant", async () => {
    await enrol("operator-1", "cred-1");

    const response = await addPasskeyRoute(
      await requestFor(sessionFor("operator-1"), {
        body: {},
        csrf: null,
        grant: await earn("operator-1", "passkey.register"),
      }),
    );

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe(ERROR_CODES.csrf);
  });

  it("refuses a request from another origin even with a grant", async () => {
    await enrol("operator-1", "cred-1");

    const response = await addPasskeyRoute(
      await requestFor(sessionFor("operator-1"), {
        body: {},
        origin: "http://evil.example",
        grant: await earn("operator-1", "passkey.register"),
      }),
    );

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe(ERROR_CODES.csrf);
  });

  it("refuses a viewer, who may not change anything", async () => {
    await enrol("operator-1", "cred-1");

    const viewer = sessionFor("operator-1");
    viewer.operator.role = "viewer";

    const response = await addPasskeyRoute(
      await requestFor(viewer, { body: {}, grant: await earn("operator-1", "passkey.register") }),
    );

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe(ERROR_CODES.forbidden);
  });

  it("refuses a viewer enrolling their first passkey, which no grant covers", async () => {
    // The ungated path, and the one that was wrong first: the first passkey is
    // exempt from the *grant*, not from the permission. A viewer's list is
    // empty, so a route that read "nothing to step up with" as "nothing to
    // check" would hand them a registration challenge and then store the key.
    const viewer = sessionFor("operator-1");
    viewer.operator.role = "viewer";

    const response = await addPasskeyRoute(await requestFor(viewer, { body: {} }));

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe(ERROR_CODES.forbidden);
  });

  it("refuses a first passkey from another origin, which no grant covers either", async () => {
    const response = await addPasskeyRoute(
      await requestFor(sessionFor("operator-1"), { body: {}, origin: "https://elsewhere.test" }),
    );

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe(ERROR_CODES.csrf);
  });
});

describe("removing a passkey", () => {
  function removeRequest(session: Session | null, id: string, grant: string | null) {
    return requestFor(session, { method: "DELETE", grant });
  }

  it("refuses without a step-up", async () => {
    await enrol("operator-1", "cred-1");
    await enrol("operator-1", "cred-2");
    const [first] = await listPasskeys(getConsoleStore().driver, "operator-1");

    const response = await deletePasskeyRoute(
      await removeRequest(sessionFor("operator-1"), first!.id, null),
      { params: Promise.resolve({ passkeyId: first!.id }) },
    );

    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe(ERROR_CODES.stepUpRequired);
  });

  it("removes the passkey with a grant for removing", async () => {
    await enrol("operator-1", "cred-1");
    await enrol("operator-1", "cred-2");
    const [first] = await listPasskeys(getConsoleStore().driver, "operator-1");

    const response = await deletePasskeyRoute(
      await removeRequest(
        sessionFor("operator-1"),
        first!.id,
        await earn("operator-1", "passkey.remove"),
      ),
      { params: Promise.resolve({ passkeyId: first!.id }) },
    );

    expect(response.status).toBe(200);
    const left = await listPasskeys(getConsoleStore().driver, "operator-1");
    expect(left).toHaveLength(1);
  });

  it("refuses to remove the last one", async () => {
    const only = await enrol("operator-1", "cred-1");

    const response = await deletePasskeyRoute(
      await removeRequest(
        sessionFor("operator-1"),
        only,
        await earn("operator-1", "passkey.remove"),
      ),
      { params: Promise.resolve({ passkeyId: only }) },
    );

    // Losing the last passkey would put every operation that needs a step-up
    // permanently out of reach, which is a worse outcome than refusing.
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe(ERROR_CODES.conflict);
  });

  it("refuses an id that is not a passkey id this console issues", async () => {
    await enrol("operator-1", "cred-1");
    await enrol("operator-1", "cred-2");

    // The column is `uuid` on Postgres and `text` on SQLite, so a hand-written
    // id would be an ordinary value on one engine and a database error on the
    // other. Refusing it here is what makes both engines answer the same way.
    const response = await deletePasskeyRoute(
      await removeRequest(
        sessionFor("operator-1"),
        "not-a-uuid",
        await earn("operator-1", "passkey.remove"),
      ),
      { params: Promise.resolve({ passkeyId: "not-a-uuid" }) },
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe(ERROR_CODES.invalidRequest);
  });

  it("refuses a passkey that belongs to someone else", async () => {
    const mine = await enrol("operator-1", "cred-1");
    await enrol("operator-1", "cred-2");
    const theirs = await enrol("operator-2", "cred-3");
    await enrol("operator-2", "cred-4");

    const response = await deletePasskeyRoute(
      await removeRequest(
        sessionFor("operator-1"),
        theirs,
        await earn("operator-1", "passkey.remove"),
      ),
      { params: Promise.resolve({ passkeyId: theirs }) },
    );

    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe(ERROR_CODES.notFound);
    expect(mine).not.toBe(theirs);
  });
});

describe("asking for step-up options", () => {
  it("refuses an operator who has no passkey", async () => {
    const response = await stepUpOptionsRoute(
      await requestFor(sessionFor("operator-1"), { body: { purpose: "passkey.remove" } }),
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe(ERROR_CODES.stepUpUnavailable);
  });

  it("offers the operator's own credentials", async () => {
    await enrol("operator-1", "cred-1");

    const response = await stepUpOptionsRoute(
      await requestFor(sessionFor("operator-1"), { body: { purpose: "passkey.remove" } }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { challengeId: string; options: { allowCredentials: Array<{ id: string }> } };
    };
    expect(body.data.options.allowCredentials.map((credential) => credential.id)).toEqual([
      "cred-1",
    ]);
  });

  it("refuses a purpose the console does not step up for", async () => {
    await enrol("operator-1", "cred-1");

    const response = await stepUpOptionsRoute(
      await requestFor(sessionFor("operator-1"), { body: { purpose: "vault.read" } }),
    );

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe(ERROR_CODES.invalidRequest);
  });
});
