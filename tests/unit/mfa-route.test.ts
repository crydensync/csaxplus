import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as ADOPTION } from "@/app/api/console/mfa/adoption/route";
import { MFA_ADOPTION_PATH } from "@/server/cryden/admin";
import { resetConfigCache } from "@/server/config/index";
import { SESSION_COOKIE, sealSession, type Session } from "@/server/auth/session";

/**
 * The MFA & Passkeys screen's read, at the route boundary.
 *
 * The view that renders the answer is covered in `mfa-view.test.tsx` with the
 * route stubbed, and the client function that reads the API is covered in
 * `cryden-admin.test.ts` the same way. This file is the part those two cannot
 * reach: the route as the browser calls it (the guard, what the route hands the
 * API, and the answer it carries back), and the section composition in
 * `src/server/mfa/adoption.ts` for the API codes that mean something other than
 * a fault.
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

type Seen = {
  method: string;
  path: string;
  authorization: string | null;
};

/** Stubs the API and records what the console asked it. */
function stubApi(reply: () => Response): Seen[] {
  const seen: Seen[] = [];

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return reply();
  });

  return seen;
}

const A_REPORT = {
  total_users: 2481,
  window_days: 30,
  factors: [
    {
      factor: "totp",
      enrolled_events: 1017,
      removed_events: 203,
      enrolled_events_in_window: 41,
      removed_events_in_window: 6,
    },
  ],
};

const SESSION: Session = {
  sid: "sid-1",
  apiSessionId: "api-1",
  operator: { id: "op-1", label: "op@example.invalid", role: "admin" },
  api: {
    accessToken: TOKEN,
    refreshToken: "refresh",
    expiresAt: Date.now() + 600_000,
  },
  csrf: "the-csrf-value",
};

/** A request as the browser makes it: same origin and the session cookie. */
async function request(session: Session | null, url: string): Promise<Request> {
  const headers = new Headers({ origin: "http://localhost:3000" });
  if (session !== null) headers.set("cookie", `${SESSION_COOKIE}=${await sealSession(session)}`);
  return new Request(`http://localhost:3000${url}`, { method: "GET", headers });
}

describe("GET /api/console/mfa/adoption", () => {
  it("answers the section the server composed, from the session's token", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_REPORT }));

    const response = await ADOPTION(await request(SESSION, "/api/console/mfa/adoption"));
    const body = (await response.json()) as { data: unknown };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ state: "ok", data: A_REPORT });
    expect(seen[0]?.path).toBe(MFA_ADOPTION_PATH);
    expect(seen[0]?.method).toBe("GET");
    expect(seen[0]?.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("needs a session: an unauthenticated call is refused before the API is asked", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_REPORT }));

    const response = await ADOPTION(await request(null, "/api/console/mfa/adoption"));
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("unauthenticated");
    expect(seen).toHaveLength(0);
  });

  it("answers a failed read as the section the API's code words", async () => {
    stubApi(() =>
      jsonResponse({ error: { code: "not_operator", message: "not an operator" } }, 403),
    );

    const response = await ADOPTION(await request(SESSION, "/api/console/mfa/adoption"));
    const body = (await response.json()) as { data?: { state?: string } };

    // Still a 200: the section carries the refusal, and the screen renders it.
    expect(response.status).toBe(200);
    expect(body.data?.state).toBe("forbidden");
  });

  it("answers a SQLite deployment with the unavailable section", async () => {
    stubApi(() =>
      jsonResponse(
        { error: { code: "not_implemented_on_sqlite", message: "no admin surface" } },
        501,
      ),
    );

    const response = await ADOPTION(await request(SESSION, "/api/console/mfa/adoption"));
    const body = (await response.json()) as { data?: { state?: string } };

    expect(body.data?.state).toBe("unavailable");
  });

  it("answers a store that was never wired with the empty section", async () => {
    stubApi(() => jsonResponse({ error: { code: "not_configured", message: "no store" } }, 404));

    const response = await ADOPTION(await request(SESSION, "/api/console/mfa/adoption"));
    const body = (await response.json()) as {
      data?: { state?: string; detail?: string };
    };

    expect(body.data?.state).toBe("empty");
    expect(body.data?.detail).toContain("no store configured for second factors");
  });
});
