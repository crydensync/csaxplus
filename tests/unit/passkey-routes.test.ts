import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE } from "@/app/api/console/passkeys/[credentialId]/route";
import { POST as BEGIN } from "@/app/api/console/passkeys/options/route";
import { GET, POST } from "@/app/api/console/passkeys/route";
import { SESSION_COOKIE, sealSession, type Session } from "@/server/auth/session";
import { resetConfigCache } from "@/server/config/index";

/**
 * The console's passkey routes, called as the browser calls them.
 *
 * What is asserted here is the part the client module's own tests cannot reach:
 * that the guards run in front of every one of them, and that what the route
 * hands the API is the session's token rather than anything the browser sent.
 * The API itself is stubbed, so a case that claims "the API was never called" is
 * checking that no request left the console at all.
 */

const SESSION_SECRET = Buffer.alloc(32, 1).toString("base64");
const VAULT_KEY = Buffer.alloc(32, 2).toString("base64");
const ORIGIN = "http://localhost:3000";

function useEnvironment() {
  process.env.CSAX_API_URL = "http://127.0.0.1:8080";
  process.env.CRYDEN_MODE = "live";
  process.env.CSAX_SESSION_SECRET = SESSION_SECRET;
  process.env.CSAX_VAULT_KEY = VAULT_KEY;
  process.env.WEBAUTHN_ORIGIN = ORIGIN;
  resetConfigCache();
}

beforeEach(useEnvironment);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Seen = { method: string; path: string; authorization: string | null; body: unknown };

/** Stubs the API and records what the console asked it. */
function stubApi(reply: () => Response): Seen[] {
  const seen: Seen[] = [];

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      authorization: new Headers(init?.headers).get("authorization"),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return reply();
  });

  return seen;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SESSION: Session = {
  sid: "sid-1",
  apiSessionId: "api-1",
  operator: { id: "op-1", label: "op@example.invalid", role: "admin" },
  api: {
    accessToken: "the-access-token",
    refreshToken: "refresh",
    expiresAt: Date.now() + 600_000,
  },
  csrf: "the-csrf-value",
};

/** A request as the browser makes it: same origin, the session cookie, the CSRF token. */
async function request(
  session: Session | null,
  init: { method?: string; body?: unknown; csrf?: string | null; origin?: string } = {},
): Promise<Request> {
  const headers = new Headers({ origin: init.origin ?? ORIGIN });
  if (session !== null) headers.set("cookie", `${SESSION_COOKIE}=${await sealSession(session)}`);
  const csrf = init.csrf === undefined ? session?.csrf : init.csrf;
  if (csrf !== null && csrf !== undefined) headers.set("x-csrf-token", csrf);
  if (init.body !== undefined) headers.set("content-type", "application/json");

  return new Request("http://localhost:3000/api/console/passkeys", {
    method: init.method ?? "POST",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

/** The context a route handler with a path parameter is called with. */
function params(credentialId: string) {
  return { params: Promise.resolve({ credentialId }) };
}

const A_CREDENTIAL = "mZ1nQ2l0aGluZy1ub3QtcmVhbA==";

/** One credential as the API describes it. */
const A_PASSKEY = {
  credential_id: A_CREDENTIAL,
  nickname: "Work laptop",
  created_at: "2026-10-01T09:00:00Z",
};

describe("GET /api/console/passkeys", () => {
  it("reads the caller's passkeys with the session's token, never the browser's", async () => {
    const seen = stubApi(() => jsonResponse({ data: [A_PASSKEY] }));

    const response = await GET(await request(SESSION));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { passkeys: [A_PASSKEY] } });
    expect(seen[0]?.authorization).toBe("Bearer the-access-token");
  });

  it("refuses an anonymous caller before asking the API anything", async () => {
    const seen = stubApi(() => jsonResponse({ data: [] }));

    const response = await GET(await request(null));

    expect(response.status).toBe(401);
    expect(seen).toEqual([]);
  });
});

describe("POST /api/console/passkeys/options", () => {
  it("hands the API's creation options back with the ceremony token", async () => {
    const options = { challenge: "YS1jaGFsbGVuZ2U", rp: { id: "localhost" } };
    stubApi(() =>
      jsonResponse({ data: { public_key: { publicKey: options }, ceremony_token: "ceremony-1" } }),
    );

    const response = await BEGIN(await request(SESSION, { body: {} }));

    expect(await response.json()).toEqual({
      data: { options, ceremonyToken: "ceremony-1" },
    });
  });

  it("refuses a viewer, who may read and not change", async () => {
    const seen = stubApi(() => jsonResponse({ data: {} }));

    const response = await BEGIN(
      await request(
        { ...SESSION, operator: { ...SESSION.operator, role: "viewer" } },
        { body: {} },
      ),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("forbidden");
    expect(seen).toEqual([]);
  });

  it("refuses a request without the session's CSRF token", async () => {
    const seen = stubApi(() => jsonResponse({ data: {} }));

    const response = await BEGIN(await request(SESSION, { body: {}, csrf: null }));

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("csrf_failed");
    expect(seen).toEqual([]);
  });

  it("refuses another origin", async () => {
    const seen = stubApi(() => jsonResponse({ data: {} }));

    const response = await BEGIN(
      await request(SESSION, { body: {}, origin: "http://evil.example" }),
    );

    expect(response.status).toBe(403);
    expect(seen).toEqual([]);
  });

  it("reports an API that cannot be reached as such, and says nothing was changed", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });

    const response = await BEGIN(await request(SESSION, { body: {} }));

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("api_unreachable");
  });
});

describe("POST /api/console/passkeys", () => {
  const CREDENTIAL = { id: "mZ1n", type: "public-key", response: { clientDataJSON: "e30" } };

  it("forwards the browser's answer to the API under the operator's token", async () => {
    const seen = stubApi(() => jsonResponse({ data: { status: "passkey registered" } }));

    const response = await POST(
      await request(SESSION, {
        body: { ceremonyToken: "ceremony-1", nickname: "Work laptop", credential: CREDENTIAL },
      }),
    );

    expect(await response.json()).toEqual({ data: { enrolled: true } });
    expect(seen[0]?.path).toBe("/v1/passkeys/register/finish");
    expect(seen[0]?.body).toEqual({
      ceremony_token: "ceremony-1",
      credential: CREDENTIAL,
      nickname: "Work laptop",
    });
  });

  it("refuses a nickname the screen could not have produced", async () => {
    const seen = stubApi(() => jsonResponse({ data: {} }));

    const response = await POST(
      await request(SESSION, {
        body: { ceremonyToken: "ceremony-1", nickname: "   ", credential: CREDENTIAL },
      }),
    );

    expect(response.status).toBe(400);
    expect(seen).toEqual([]);
  });
});

describe("DELETE /api/console/passkeys/{credentialID}", () => {
  it("sends the password on to the API and reports the removal", async () => {
    const seen = stubApi(() => jsonResponse({ data: { status: "passkey removed" } }));

    const response = await DELETE(
      await request(SESSION, { method: "DELETE", body: { password: "hunter2" } }),
      params(A_CREDENTIAL),
    );

    expect(await response.json()).toEqual({ data: { removed: true } });
    expect(seen[0]?.method).toBe("DELETE");
    // The padding is escaped on the way out: `=` is part of the id cryden
    // encoded, and a segment that lost it names a different credential.
    expect(seen[0]?.path).toBe(`/v1/passkeys/${A_CREDENTIAL.replace(/=/g, "%3D")}`);
    expect(seen[0]?.body).toEqual({ password: "hunter2" });
  });

  it("refuses an id that would become different path syntax, without calling the API", async () => {
    const seen = stubApi(() => jsonResponse({ data: {} }));

    const response = await DELETE(
      await request(SESSION, { method: "DELETE", body: { password: "hunter2" } }),
      params("../../v1/admin/users"),
    );

    expect(response.status).toBe(400);
    expect(seen).toEqual([]);
  });

  it("refuses a removal with no password, which the API would reject anyway", async () => {
    const seen = stubApi(() => jsonResponse({ data: {} }));

    const response = await DELETE(
      await request(SESSION, { method: "DELETE", body: {} }),
      params(A_CREDENTIAL),
    );

    expect(response.status).toBe(400);
    expect(seen).toEqual([]);
  });

  it("passes the API's refusal of a wrong password through with its own wording", async () => {
    stubApi(() =>
      jsonResponse({ error: { code: "invalid_credentials", message: "invalid credentials" } }, 401),
    );

    const response = await DELETE(
      await request(SESSION, { method: "DELETE", body: { password: "wrong" } }),
      params(A_CREDENTIAL),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error).toEqual({
      code: "invalid_credentials",
      message: "invalid credentials",
    });
  });

  it("refuses a viewer", async () => {
    const seen = stubApi(() => jsonResponse({ data: {} }));

    const response = await DELETE(
      await request(
        { ...SESSION, operator: { ...SESSION.operator, role: "viewer" } },
        { method: "DELETE", body: { password: "hunter2" } },
      ),
      params(A_CREDENTIAL),
    );

    expect(response.status).toBe(403);
    expect(seen).toEqual([]);
  });
});
