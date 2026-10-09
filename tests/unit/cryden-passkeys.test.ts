import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetConfigCache } from "@/server/config/index";
import { CrydenError } from "@/server/cryden/http";
import {
  PASSKEYS_PATH,
  REGISTER_BEGIN_PATH,
  REGISTER_FINISH_PATH,
  beginRegistration,
  fetchPasskeys,
  finishRegistration,
  isCredentialIdSegment,
  passkeyPath,
  removePasskey,
} from "@/server/cryden/passkeys";

/**
 * The passkey calls, at the boundary where they meet the API.
 *
 * Every case goes through the real transport against a stubbed `fetch`, so what
 * is asserted is the request the console actually sends and the answer it
 * actually accepts. The two that matter most are here because they are the ones
 * that would fail quietly in a browser rather than at a type: the creation
 * options arrive wrapped in `publicKey` and have to be unwrapped, and a
 * credential id is base64 with padding so its `=` has to survive the path.
 */

const TOKEN = "a-token-that-is-not-a-real-one";
const SESSION_SECRET = Buffer.alloc(32, 1).toString("base64");
const VAULT_KEY = Buffer.alloc(32, 2).toString("base64");

function useEnvironment() {
  process.env.CSAX_API_URL = "http://127.0.0.1:8080";
  process.env.CRYDEN_MODE = "live";
  process.env.CSAX_SESSION_SECRET = SESSION_SECRET;
  process.env.CSAX_VAULT_KEY = VAULT_KEY;
  process.env.WEBAUTHN_ORIGIN = "http://localhost:3000";
  resetConfigCache();
}

beforeEach(useEnvironment);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Seen = { method: string; path: string; authorization: string | null; body: unknown };

/** Records the requests the console made, and answers each with `handler`'s reply. */
function stubApi(handler: () => Response): Seen[] {
  const seen: Seen[] = [];

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push({
      method: init?.method ?? "GET",
      path: `${url.pathname}${url.search}`,
      authorization: new Headers(init?.headers).get("authorization"),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return handler();
  });

  return seen;
}

const A_PASSKEY = {
  credential_id: "mZ1nQ2l0aGluZy1ub3QtcmVhbA==",
  nickname: "Work laptop",
  created_at: "2026-10-01T09:00:00Z",
};

describe("fetchPasskeys", () => {
  it("reads the caller's own list with the operator's token", async () => {
    const seen = stubApi(() => jsonResponse({ data: [A_PASSKEY] }));
    const passkeys = await fetchPasskeys({ token: TOKEN });

    expect(passkeys).toEqual([A_PASSKEY]);
    expect(seen).toEqual([
      { method: "GET", path: PASSKEYS_PATH, authorization: `Bearer ${TOKEN}`, body: undefined },
    ]);
  });

  it("reads an operator with no passkeys as an empty list", async () => {
    stubApi(() => jsonResponse({ data: [] }));
    await expect(fetchPasskeys({ token: TOKEN })).resolves.toEqual([]);
  });

  it("accepts a credential that has never been used, which has no last_used_at", async () => {
    stubApi(() => jsonResponse({ data: [A_PASSKEY] }));
    const [passkey] = await fetchPasskeys({ token: TOKEN });
    expect(passkey?.last_used_at).toBeUndefined();
  });

  it("refuses a list whose entries are not credentials, rather than rendering undefined", async () => {
    stubApi(() => jsonResponse({ data: [{ credential_id: "x" }] }));
    await expect(fetchPasskeys({ token: TOKEN })).rejects.toBeInstanceOf(CrydenError);
  });

  it("passes the API's own refusal through with its code and wording", async () => {
    stubApi(() =>
      jsonResponse({ error: { code: "passkeys_not_configured", message: "not configured" } }, 404),
    );

    await expect(fetchPasskeys({ token: TOKEN })).rejects.toMatchObject({
      kind: "http",
      status: 404,
      code: "passkeys_not_configured",
    });
  });
});

describe("beginRegistration", () => {
  /**
   * cryden marshals a `*protocol.CredentialCreation`, whose one field is
   * `publicKey`. The browser's `startRegistration` wants what is *inside* that
   * field, so this is the transformation the console owes it.
   */
  const AS_THE_API_SENDS_IT = {
    publicKey: {
      challenge: "YS1jaGFsbGVuZ2U",
      rp: { id: "localhost", name: "CrydenSync" },
      user: { id: "dXNlcg", name: "operator@example.invalid", displayName: "operator" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    },
  };

  it("unwraps the creation options the API wraps in publicKey", async () => {
    const seen = stubApi(() =>
      jsonResponse({ data: { public_key: AS_THE_API_SENDS_IT, ceremony_token: "ceremony-1" } }),
    );

    const offer = await beginRegistration({ token: TOKEN });

    expect(offer.ceremonyToken).toBe("ceremony-1");
    // The inner object, not the wrapper: handing the wrapper to the browser's
    // WebAuthn call is the failure this unwrapping exists to prevent.
    expect(offer.options).toEqual(AS_THE_API_SENDS_IT.publicKey);
    expect(offer.options).not.toHaveProperty("publicKey");
    expect(seen[0]?.path).toBe(REGISTER_BEGIN_PATH);
  });

  it("refuses options in a shape this console cannot unwrap", async () => {
    stubApi(() =>
      jsonResponse({ data: { public_key: { challenge: "bare" }, ceremony_token: "ceremony-1" } }),
    );

    await expect(beginRegistration({ token: TOKEN })).rejects.toMatchObject({ kind: "malformed" });
  });

  it("refuses an answer with no ceremony token, which the second half could not use", async () => {
    stubApi(() => jsonResponse({ data: { public_key: AS_THE_API_SENDS_IT } }));
    await expect(beginRegistration({ token: TOKEN })).rejects.toMatchObject({ kind: "malformed" });
  });
});

describe("finishRegistration", () => {
  const CREDENTIAL = {
    id: "mZ1n",
    rawId: "mZ1n",
    type: "public-key",
    response: { clientDataJSON: "e30" },
  };

  it("forwards the browser's answer unmodified, with the token it belongs to", async () => {
    const seen = stubApi(() => jsonResponse({ data: { status: "passkey registered" } }));

    await finishRegistration({
      token: TOKEN,
      ceremonyToken: "ceremony-1",
      credential: CREDENTIAL,
      nickname: "Work laptop",
    });

    expect(seen[0]).toEqual({
      method: "POST",
      path: REGISTER_FINISH_PATH,
      authorization: `Bearer ${TOKEN}`,
      body: {
        ceremony_token: "ceremony-1",
        credential: CREDENTIAL,
        nickname: "Work laptop",
      },
    });
  });

  it("reports an expired ceremony as the API's own refusal", async () => {
    stubApi(() =>
      jsonResponse(
        {
          error: {
            code: "invalid_ceremony_token",
            message: "this passkey ceremony has expired",
          },
        },
        400,
      ),
    );

    await expect(
      finishRegistration({
        token: TOKEN,
        ceremonyToken: "stale",
        credential: CREDENTIAL,
        nickname: "Work laptop",
      }),
    ).rejects.toMatchObject({ code: "invalid_ceremony_token", status: 400 });
  });
});

describe("removePasskey", () => {
  it("sends the password the API asks for, and nothing the API did not", async () => {
    const seen = stubApi(() => jsonResponse({ data: { status: "passkey removed" } }));

    await removePasskey({
      token: TOKEN,
      credentialId: "mZ1nQ2l0aGluZy1ub3QtcmVhbA==",
      password: "correct horse battery staple",
    });

    expect(seen[0]?.method).toBe("DELETE");
    // The padding survives: it is part of the id cryden encoded, and a path
    // segment that lost it is a different credential.
    expect(seen[0]?.path).toBe(`${PASSKEYS_PATH}/mZ1nQ2l0aGluZy1ub3QtcmVhbA%3D%3D`);
    expect(seen[0]?.body).toEqual({ password: "correct horse battery staple" });
  });

  it("reports a wrong password as the API's own refusal", async () => {
    stubApi(() =>
      jsonResponse({ error: { code: "invalid_credentials", message: "invalid credentials" } }, 401),
    );

    await expect(
      removePasskey({ token: TOKEN, credentialId: "mZ1n", password: "wrong" }),
    ).rejects.toMatchObject({ code: "invalid_credentials", status: 401 });
  });
});

describe("credential ids as path segments", () => {
  it("accepts what cryden encodes: base64url, padded", () => {
    expect(isCredentialIdSegment("mZ1nQ2l0aGluZy1ub3QtcmVhbA==")).toBe(true);
    expect(isCredentialIdSegment("abc-_123")).toBe(true);
  });

  it("refuses anything that would become different path syntax", () => {
    for (const value of ["", "a/b", "a?b", "a#b", "..", "a b", "a%2Fb", "a+b"]) {
      expect(isCredentialIdSegment(value), value).toBe(false);
    }
  });

  it("escapes a padded id so its `=` cannot end the segment early", () => {
    expect(passkeyPath("ab==")).toBe(`${PASSKEYS_PATH}/ab%3D%3D`);
  });
});
