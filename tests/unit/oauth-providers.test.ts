import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as TEST_PROVIDER } from "@/app/api/console/oauth/[provider]/test/route";
import { GET as PROVIDERS } from "@/app/api/console/oauth/providers/route";
import { OAUTH_TEST_NOT_CONFIGURED_DETAIL } from "@/lib/oauth";
import { SESSION_COOKIE, sealSession, type Session } from "@/server/auth/session";
import { OAUTH_PROVIDERS_PATH } from "@/server/cryden/admin";
import { resetConfigCache } from "@/server/config/index";

/** The test route's own URL, as the browser builds it from a row. */
const TEST_URL = "/api/console/oauth/google/test";

/**
 * The OAuth Providers screen's reads, at both boundaries.
 *
 * The client functions are covered in `cryden-admin.test.ts` against a
 * stubbed fetch. This file is the part those tests cannot reach: the routes as
 * the browser calls them (guard, CSRF, what the route hands the API), and the
 * section composition in `src/server/oauth/providers.ts`, where the API's
 * `oauth_provider_not_configured` refusal is turned into the state an operator
 * can act on rather than a fault.
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
  body: unknown;
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
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return reply();
  });

  return seen;
}

const A_PROVIDER_LIST = {
  providers: [
    { provider: "google", configured: true },
    { provider: "github", configured: false },
  ],
};

const A_VERDICT = {
  provider: "google",
  configured: true,
  status: "ok",
  http_status: 400,
  latency_ms: 42,
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

/** A request as the browser makes it: same origin, the session cookie, the CSRF token. */
async function request(
  session: Session | null,
  url: string,
  init: { method?: string; csrf?: string | null; origin?: string } = {},
): Promise<Request> {
  const headers = new Headers({ origin: init.origin ?? "http://localhost:3000" });
  if (session !== null) headers.set("cookie", `${SESSION_COOKIE}=${await sealSession(session)}`);
  const csrf = init.csrf === undefined ? session?.csrf : init.csrf;
  if (csrf !== null && csrf !== undefined) headers.set("x-csrf-token", csrf);

  return new Request(`http://localhost:3000${url}`, {
    method: init.method ?? "GET",
    headers,
  });
}

describe("GET /api/console/oauth/providers", () => {
  it("answers the section the server composed, from the session's token", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_PROVIDER_LIST }));

    const response = await PROVIDERS(await request(SESSION, "/api/console/oauth/providers"));
    const body = (await response.json()) as { data: unknown };

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ state: "ok", data: A_PROVIDER_LIST.providers });
    expect(seen[0]?.path).toBe(OAUTH_PROVIDERS_PATH);
    expect(seen[0]?.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("needs a session: an unauthenticated call is refused before the API is asked", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_PROVIDER_LIST }));

    const response = await PROVIDERS(await request(null, "/api/console/oauth/providers"));
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("unauthenticated");
    expect(seen).toHaveLength(0);
  });

  it("answers a failed read as the section the API's code words", async () => {
    stubApi(() =>
      jsonResponse({ error: { code: "not_operator", message: "not an operator" } }, 403),
    );

    const response = await PROVIDERS(await request(SESSION, "/api/console/oauth/providers"));
    const body = (await response.json()) as { data?: { state?: string; detail?: string } };

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

    const response = await PROVIDERS(await request(SESSION, "/api/console/oauth/providers"));
    const body = (await response.json()) as { data?: { state?: string } };

    expect(body.data?.state).toBe("unavailable");
  });
});

describe("POST /api/console/oauth/[provider]/test", () => {
  const params = (provider: string) => ({
    params: Promise.resolve({ provider }),
  });

  it("probes through to the API with the session's token", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_VERDICT }));

    const response = await TEST_PROVIDER(
      await request(SESSION, TEST_URL, { method: "POST" }),
      params("google"),
    );
    const body = (await response.json()) as { data?: unknown };

    expect(response.status).toBe(200);
    expect(body.data).toEqual(A_VERDICT);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.path).toBe("/v1/admin/oauth/google/test");
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("words an unconfigured provider as the deployment's configuration", async () => {
    stubApi(() =>
      jsonResponse(
        {
          error: {
            code: "oauth_provider_not_configured",
            message: "this OAuth provider is not configured on this deployment",
          },
        },
        404,
      ),
    );

    const response = await TEST_PROVIDER(
      await request(SESSION, TEST_URL, { method: "POST" }),
      params("github"),
    );
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };

    expect(response.status).toBe(502);
    expect(body.error?.code).toBe("not_found");
    expect(body.error?.message).toBe(OAUTH_TEST_NOT_CONFIGURED_DETAIL);
  });

  it("needs the mutation guard: no CSRF, no probe", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_VERDICT }));

    const response = await TEST_PROVIDER(
      await request(SESSION, TEST_URL, { method: "POST", csrf: null }),
      params("google"),
    );
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe("csrf_failed");
    // The probe was never spent.
    expect(seen).toHaveLength(0);
  });

  it("refuses a provider segment that is not a provider name", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_VERDICT }));

    const response = await TEST_PROVIDER(
      await request(SESSION, TEST_URL, { method: "POST" }),
      params("../etc"),
    );
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(400);
    expect(body.error?.code).toBe("invalid_request");
    expect(seen).toHaveLength(0);
  });
});
