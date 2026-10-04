import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CSRF_HEADER, checkOrigin, createCsrfToken, csrfTokensMatch } from "@/server/auth/csrf";
import { isAdmin, isRole, mayMutate, mayReachSecrets } from "@/server/auth/roles";
import {
  accessTokenNeedsRefresh,
  openSession,
  sealSession,
  sessionRole,
  withRefreshedTokens,
  type Session,
} from "@/server/auth/session";
import { resetConfigCache } from "@/server/config/index";
import { CrydenError, apiRequest, statusFromError } from "@/server/cryden/http";

const SESSION_SECRET = Buffer.alloc(32, 1).toString("base64");
const VAULT_KEY = Buffer.alloc(32, 2).toString("base64");

function useEnvironment() {
  process.env.CSAX_API_URL = "http://127.0.0.1:8080";
  process.env.CSAX_SESSION_SECRET = SESSION_SECRET;
  process.env.CSAX_VAULT_KEY = VAULT_KEY;
  process.env.WEBAUTHN_RP_ID = "localhost";
  process.env.WEBAUTHN_ORIGIN = "http://localhost:3000";
  resetConfigCache();
}

function aSession(overrides: Partial<Session> = {}): Session {
  return {
    sid: "session-1",
    operator: { id: "operator-1", label: "An operator", role: "admin" },
    api: {
      accessToken: "access-token-value",
      refreshToken: "refresh-token-value",
      expiresAt: Date.now() + 60 * 60 * 1000,
    },
    csrf: "csrf-value",
    ...overrides,
  };
}

beforeEach(() => {
  useEnvironment();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CSRF", () => {
  it("mints a fresh, unguessable token each time", () => {
    const first = createCsrfToken();
    const second = createCsrfToken();
    expect(first).not.toBe(second);
    // 32 bytes of base64url.
    expect(first).toHaveLength(43);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("accepts only the exact token, and never a missing one", () => {
    const token = createCsrfToken();
    expect(csrfTokensMatch(token, token)).toBe(true);
    expect(csrfTokensMatch(token, null)).toBe(false);
    expect(csrfTokensMatch(token, "")).toBe(false);
    expect(csrfTokensMatch(token, createCsrfToken())).toBe(false);
    // A prefix, which a length-blind comparison would have to reject too.
    expect(csrfTokensMatch(token, token.slice(0, -1))).toBe(false);
  });

  it("accepts the configured origin and the matching host", () => {
    expect(checkOrigin("http://localhost:3000", "http://localhost:3000", "localhost:3000")).toBe(
      "ok",
    );
    // A trailing slash is not a different origin.
    expect(checkOrigin("http://localhost:3000/", "http://localhost:3000", null)).toBe("ok");
    // No Origin header, but the Host agrees with the configured origin.
    expect(checkOrigin(null, "http://localhost:3000", "localhost:3000")).toBe("ok");
  });

  it("refuses another origin and another host", () => {
    expect(checkOrigin("http://evil.example", "http://localhost:3000", null)).toBe("mismatch");
    expect(checkOrigin(null, "http://localhost:3000", "evil.example")).toBe("mismatch");
    // A different port is a different origin.
    expect(checkOrigin("http://localhost:4000", "http://localhost:3000", null)).toBe("mismatch");
  });

  it("reports a request that carries neither Origin nor Host", () => {
    expect(checkOrigin(null, "http://localhost:3000", null)).toBe("missing");
  });

  it("names the header the browser has to echo", () => {
    expect(CSRF_HEADER).toBe("x-csrf-token");
  });
});

describe("console roles", () => {
  it("recognises the three roles and nothing else", () => {
    expect(isRole("owner")).toBe(true);
    expect(isRole("admin")).toBe(true);
    expect(isRole("viewer")).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("keeps a viewer from mutating or reaching secrets", () => {
    expect(isAdmin("viewer")).toBe(false);
    expect(mayMutate("viewer")).toBe(false);
    expect(mayReachSecrets("viewer")).toBe(false);

    expect(mayMutate("admin")).toBe(true);
    expect(mayReachSecrets("admin")).toBe(true);
    expect(mayMutate("owner")).toBe(true);
  });
});

describe("the session cookie", () => {
  it("round-trips a session", async () => {
    const session = aSession();
    const cookie = await sealSession(session);
    expect(await openSession(cookie)).toEqual(session);
  });

  it("does not reveal what it carries", async () => {
    const cookie = await sealSession(aSession());
    // The tokens are inside; the cookie must not show them. A five-part JWE
    // keeps the payload in the ciphertext, not in a readable segment.
    expect(cookie).not.toContain("access-token-value");
    expect(cookie).not.toContain("refresh-token-value");
    expect(cookie.split(".")).toHaveLength(5);
  });

  it("refuses a cookie that was not minted by this console", async () => {
    expect(await openSession(undefined)).toBeNull();
    expect(await openSession("")).toBeNull();
    expect(await openSession("not-a-cookie")).toBeNull();
    expect(await openSession("a.b.c.d.e")).toBeNull();
  });

  it("refuses a tampered cookie", async () => {
    const cookie = await sealSession(aSession());
    const parts = cookie.split(".");
    // Flip the ciphertext. Decryption is authenticated, so this must fail
    // rather than decrypt into a different session.
    const tampered = [...parts];
    tampered[3] = `${parts[3]}A`;
    expect(await openSession(tampered.join("."))).toBeNull();
  });

  it("refuses a cookie sealed with another key", async () => {
    const cookie = await sealSession(aSession());
    process.env.CSAX_SESSION_SECRET = Buffer.alloc(32, 9).toString("base64");
    resetConfigCache();
    expect(await openSession(cookie)).toBeNull();
  });

  it("reports the role, and renews the tokens without disturbing the rest", async () => {
    const session = aSession();
    expect(sessionRole(session)).toBe("admin");

    const renewed = withRefreshedTokens(session, {
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresAt: 42,
    });
    expect(renewed.api.accessToken).toBe("new-access");
    expect(renewed.sid).toBe(session.sid);
    expect(renewed.operator).toEqual(session.operator);
    expect(renewed.csrf).toBe(session.csrf);
  });
});

describe("token lifetime", () => {
  it("asks for a refresh before the token actually expires", () => {
    const now = 1_000_000;
    const longLived = aSession({ api: { ...aSession().api, expiresAt: now + 10 * 60 * 1000 } });
    expect(accessTokenNeedsRefresh(longLived, now)).toBe(false);

    // Inside the leeway window, a request already in flight would fail.
    const nearlyDone = aSession({ api: { ...aSession().api, expiresAt: now + 30 * 1000 } });
    expect(accessTokenNeedsRefresh(nearlyDone, now)).toBe(true);

    const expired = aSession({ api: { ...aSession().api, expiresAt: now - 1 } });
    expect(accessTokenNeedsRefresh(expired, now)).toBe(true);
  });
});

describe("the API transport", () => {
  function stubFetch(implementation: typeof fetch) {
    vi.stubGlobal("fetch", vi.fn(implementation));
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  it("returns the envelope's data and sends the bearer token", async () => {
    let seen: RequestInit | undefined;
    let seenUrl: URL | undefined;
    stubFetch(async (input, init) => {
      seenUrl = new URL(String(input));
      seen = init;
      return jsonResponse({ data: { ok: true } });
    });

    await expect(
      apiRequest<{ ok: boolean }>({ method: "GET", path: "/v1/health", token: "a-token" }),
    ).resolves.toEqual({ ok: true });

    expect(seenUrl?.pathname).toBe("/v1/health");
    expect(new Headers(seen?.headers).get("authorization")).toBe("Bearer a-token");
    expect(seen?.method).toBe("GET");
    // Never cached: every screen shows current state.
    expect(seen?.cache).toBe("no-store");
  });

  it("sends a body as JSON and does not add an authorization header without a token", async () => {
    let seen: RequestInit | undefined;
    stubFetch(async (_input, init) => {
      seen = init;
      return jsonResponse({ data: null });
    });

    await apiRequest({ method: "POST", path: "/v1/login", body: { email: "a@b.invalid" } });

    expect(seen?.body).toBe(JSON.stringify({ email: "a@b.invalid" }));
    expect(new Headers(seen?.headers).get("content-type")).toBe("application/json");
    expect(new Headers(seen?.headers).has("authorization")).toBe(false);
  });

  it("turns an error envelope into a CrydenError carrying the API's code", async () => {
    stubFetch(async () =>
      jsonResponse({ error: { code: "invalid_credentials", message: "no" } }, 401),
    );

    const error = await apiRequest({ method: "POST", path: "/v1/login" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CrydenError);
    expect(error).toMatchObject({ kind: "http", status: 401, code: "invalid_credentials" });
    expect((error as CrydenError).retryable).toBe(false);
  });

  it("treats a 5xx as retryable and a refusal as final", async () => {
    stubFetch(async () => jsonResponse({ error: { code: "unavailable" } }, 503));
    const error = await apiRequest({ method: "GET", path: "/v1/health" }).catch((e: unknown) => e);
    expect((error as CrydenError).retryable).toBe(true);
    expect(statusFromError(error)).toBe("degraded");
  });

  it("reports a connection it could not make", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });

    const error = await apiRequest({ method: "GET", path: "/v1/health" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CrydenError);
    expect((error as CrydenError).kind).toBe("network");
    expect((error as CrydenError).retryable).toBe(true);
    expect(statusFromError(error)).toBe("offline");
  });

  it("gives up on an API that never answers", async () => {
    stubFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    const error = await apiRequest({ method: "GET", path: "/v1/health", timeoutMs: 20 }).catch(
      (e: unknown) => e,
    );
    expect((error as CrydenError).kind).toBe("timeout");
    expect(statusFromError(error)).toBe("offline");
  });

  it("refuses an answer that is not the envelope", async () => {
    stubFetch(async () => jsonResponse({ unexpected: true }));
    const error = await apiRequest({ method: "GET", path: "/v1/health" }).catch((e: unknown) => e);
    expect((error as CrydenError).kind).toBe("malformed");

    stubFetch(async () => new Response("<html>not json</html>", { status: 200 }));
    const html = await apiRequest({ method: "GET", path: "/v1/health" }).catch((e: unknown) => e);
    expect((html as CrydenError).kind).toBe("malformed");

    stubFetch(async () => new Response("", { status: 200 }));
    const empty = await apiRequest({ method: "GET", path: "/v1/health" }).catch((e: unknown) => e);
    expect((empty as CrydenError).kind).toBe("malformed");
  });

  it("never puts a token in the error it throws", async () => {
    stubFetch(async () => jsonResponse({ error: { code: "unauthorized", message: "no" } }, 401));

    const error = await apiRequest({
      method: "GET",
      path: "/v1/admin/users",
      token: "secret-token-value",
    }).catch((e: unknown) => e);

    const rendered = `${String(error)} ${JSON.stringify(error)}`;
    expect(rendered).not.toContain("secret-token-value");
  });
});
