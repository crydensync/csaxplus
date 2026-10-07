import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type SecondFactorMethod } from "@/lib/second-factor";
import { beginPasskey, completeTotp, signInWithPassword } from "@/server/auth/api-auth";
import { decodeAccessToken } from "@/server/auth/claims";
import { clearCookie, parseCookieHeader, serializeCookie } from "@/server/auth/cookies";
import {
  renewSession,
  sessionFromPasskey,
  sessionFromRecoveryCode,
  sessionFromTokens,
  sessionFromTotp,
  signIn,
  signOut,
} from "@/server/auth/flow";
import {
  requireCsrf,
  requireMutation,
  requireSameOrigin,
  requireSession,
} from "@/server/auth/guard";
import {
  openPendingLogin,
  startPending,
  sealPendingLogin,
  withCeremonyToken,
} from "@/server/auth/pending";
import { ERROR_CODES } from "@/server/auth/response";
import { sealValue } from "@/server/auth/sealed";
import {
  openSession,
  sealSession,
  SESSION_AUDIENCE,
  SESSION_COOKIE,
  type Session,
} from "@/server/auth/session";
import { resetConfigCache } from "@/server/config/index";
import { CrydenError } from "@/server/cryden/http";

const SESSION_SECRET = Buffer.alloc(32, 1).toString("base64");
const VAULT_KEY = Buffer.alloc(32, 2).toString("base64");

const ORIGIN = "http://localhost:3000";
const HOST = "localhost:3000";

function useEnvironment() {
  process.env.CSAX_API_URL = "http://127.0.0.1:8080";
  process.env.CSAX_SESSION_SECRET = SESSION_SECRET;
  process.env.CSAX_VAULT_KEY = VAULT_KEY;
  process.env.WEBAUTHN_RP_ID = "localhost";
  process.env.WEBAUTHN_ORIGIN = ORIGIN;
  resetConfigCache();
}

beforeEach(() => {
  useEnvironment();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A JWT with the given payload. The signature is never checked by the console. */
function accessToken(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part(claims)}.not-a-real-signature`;
}

const NOW_SECONDS = Math.floor(Date.now() / 1000);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Handler = (request: Request) => Response | Promise<Response>;

/**
 * Stubs the API by method and path, and records what was asked. A request with
 * no handler is a test that forgot one rather than a 404 the code under test
 * would have to interpret.
 */
function stubApi(routes: Record<string, Handler>) {
  const seen: Array<{ method: string; path: string; body: unknown; authorization: string | null }> =
    [];

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const key = `${method} ${url.pathname}`;
    seen.push({
      method,
      path: url.pathname,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      authorization: new Headers(init?.headers).get("authorization"),
    });

    const handler = routes[key];
    if (handler === undefined) throw new Error(`no stub for ${key}`);
    return handler(new Request(url, init));
  });

  return seen;
}

/** A paused login, as the API's pause answer describes it. */
function pausedLogin(methods: SecondFactorMethod[] = ["totp"]) {
  return startPending({ pendingToken: "pending-token", methods }, "op@example.invalid");
}

describe("reading an access token", () => {
  it("takes the operator's identity, role and real expiry from the claims", () => {
    const claims = decodeAccessToken(
      accessToken({ sub: "user-1", role: "admin", exp: NOW_SECONDS + 900 }),
    );
    expect(claims).toEqual({
      userId: "user-1",
      role: "admin",
      expiresAt: (NOW_SECONDS + 900) * 1000,
    });
  });

  it("reads anything that is not the literal admin role as a viewer", () => {
    // The API recognises one value; every other account is a console viewer.
    expect(decodeAccessToken(accessToken({ sub: "u", role: "superadmin" }))?.role).toBe("viewer");
    expect(decodeAccessToken(accessToken({ sub: "u", role: null }))?.role).toBe("viewer");
    expect(decodeAccessToken(accessToken({ sub: "u" }))?.role).toBe("viewer");
  });

  it("treats a token with no expiry as already due for renewal", () => {
    const claims = decodeAccessToken(accessToken({ sub: "u", role: "admin" }));
    expect(claims?.expiresAt).toBeLessThanOrEqual(Date.now());
  });

  it("refuses anything that is not a token it can read", () => {
    expect(decodeAccessToken("")).toBeNull();
    expect(decodeAccessToken("not.a.token")).toBeNull();
    expect(decodeAccessToken("a.b")).toBeNull();
    expect(decodeAccessToken(`${Buffer.from("{}").toString("base64url")}`)).toBeNull();
    // A payload with no subject identifies nobody.
    expect(decodeAccessToken(accessToken({ role: "admin" }))).toBeNull();
    expect(decodeAccessToken(accessToken({ sub: "" }))).toBeNull();
    // A well-formed three part token whose payload is not JSON.
    expect(
      decodeAccessToken(
        `${Buffer.from("{}").toString("base64url")}.${Buffer.from("nope").toString("base64url")}.x`,
      ),
    ).toBeNull();
  });
});

describe("cookies", () => {
  it("reads the cookies a request presented", () => {
    const jar = parseCookieHeader("a=1; csax_session=value; b=2");
    expect(jar.get("csax_session")).toBe("value");
    expect(jar.get("a")).toBe("1");
    expect(parseCookieHeader(null).size).toBe(0);
    expect(parseCookieHeader("").size).toBe(0);
    // A part with no "=" is not a cookie.
    expect(parseCookieHeader("nonsense").size).toBe(0);
  });

  it("drops a name that appears twice rather than picking one", () => {
    // Two cookies of the same name can only come from somewhere this console
    // does not control. The caller then simply looks signed out.
    const jar = parseCookieHeader("csax_session=one; csax_session=two");
    expect(jar.has("csax_session")).toBe(false);
    expect(parseCookieHeader("csax_session=one; other=x; csax_session=two").get("other")).toBe("x");
  });

  it("writes the attributes that make a session cookie safe", () => {
    const value = serializeCookie("csax_session", "sealed", {
      path: "/",
      maxAge: 60,
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
    expect(value).toBe("csax_session=sealed; Path=/; Max-Age=60; SameSite=Lax; HttpOnly; Secure");
  });

  it("clears a cookie with the same attributes, so the browser matches it", () => {
    const cleared = clearCookie("csax_session", {
      path: "/",
      maxAge: 60,
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    });
    expect(cleared).toContain("csax_session=;");
    expect(cleared).toContain("Max-Age=0");
    // A Secure-less origin must not be given a Secure cookie, or the browser
    // drops it and the operator appears signed out for no visible reason.
    expect(cleared).not.toContain("Secure");
  });
});

describe("a sealed value", () => {
  it("round-trips a paused login", async () => {
    const pending = pausedLogin(["totp", "webauthn"]);
    expect(await openPendingLogin(await sealPendingLogin(pending))).toEqual(pending);
  });

  it("does not let one kind of sealed cookie stand in for another", async () => {
    // Same key, different audience: a paused login must never be readable as a
    // session, and a session must never satisfy the pending step.
    const pendingCookie = await sealPendingLogin(pausedLogin());
    expect(await openSession(pendingCookie)).toBeNull();

    const sessionCookie = await sealSession({
      sid: "s",
      apiSessionId: null,
      operator: { id: "u", label: "u", role: "admin" },
      api: { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 600_000 },
      csrf: "c",
    });
    expect(await openPendingLogin(sessionCookie)).toBeNull();
  });

  it("keeps the ceremony token across the passkey step", async () => {
    const pending = withCeremonyToken(pausedLogin(["webauthn"]), "ceremony-1");
    expect((await openPendingLogin(await sealPendingLogin(pending)))?.ceremonyToken).toBe(
      "ceremony-1",
    );
  });

  it("refuses a cookie whose shape has changed since it was written", async () => {
    // A session cookie minted before apiSessionId existed has to be refused, not
    // read with the field missing: the console would otherwise stop being able to
    // revoke at sign-out without anything saying so.
    const stale = await sealValue(
      {
        sid: "sid-1",
        operator: { id: "u", label: "op@example.invalid", role: "admin" },
        api: { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 600_000 },
        csrf: "c",
      },
      SESSION_AUDIENCE,
      60,
    );
    expect(await openSession(stale)).toBeNull();
  });
});

describe("the API's login answers", () => {
  it("reads tokens", async () => {
    stubApi({
      "POST /v1/login": () => jsonResponse({ data: { access_token: "at", refresh_token: "rt" } }),
    });
    await expect(signInWithPassword("a@b.invalid", "pw")).resolves.toEqual({
      kind: "tokens",
      tokens: { accessToken: "at", refreshToken: "rt" },
    });
  });

  it("reads a pause as a pause, keeping only the methods it can complete", async () => {
    stubApi({
      "POST /v1/login": () =>
        jsonResponse({
          data: {
            second_factor_required: true,
            pending_token: "pending",
            methods: ["totp", "recovery_code"],
          },
        }),
    });
    await expect(signInWithPassword("a@b.invalid", "pw")).resolves.toEqual({
      kind: "second-factor",
      paused: { pendingToken: "pending", methods: ["totp", "recovery_code"] },
    });
  });

  it("fails loudly when the only factor offered is one it cannot complete", async () => {
    stubApi({
      "POST /v1/login": () =>
        jsonResponse({
          data: { second_factor_required: true, pending_token: "p", methods: ["sms"] },
        }),
    });
    const error = await signInWithPassword("a@b.invalid", "pw").catch((e: unknown) => e);
    expect((error as CrydenError).kind).toBe("malformed");
  });

  it("fails loudly when the answer is not the shape the API documents", async () => {
    stubApi({ "POST /v1/login": () => jsonResponse({ data: { access_token: "at" } }) });
    const error = await signInWithPassword("a@b.invalid", "pw").catch((e: unknown) => e);
    expect((error as CrydenError).kind).toBe("malformed");
  });

  it("keeps the API's own code on a refusal", async () => {
    stubApi({
      "POST /v1/login": () =>
        jsonResponse({ error: { code: "account_locked", message: "locked" } }, 403),
    });
    const error = await signInWithPassword("a@b.invalid", "pw").catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "http", status: 403, code: "account_locked" });
  });

  it("passes a pause's pending token on the completing call", async () => {
    const seen = stubApi({
      "POST /v1/login/totp": () =>
        jsonResponse({ data: { access_token: "at", refresh_token: "rt" } }),
    });

    await completeTotp("pending-value", "123456");
    expect(seen[0]?.body).toEqual({ pending_token: "pending-value", code: "123456" });
  });

  it("returns the challenge and the ceremony token from a passkey begin", async () => {
    stubApi({
      "POST /v1/login/passkey/begin": () =>
        jsonResponse({ data: { public_key: { challenge: "abc" }, ceremony_token: "cer" } }),
    });
    await expect(beginPasskey("pending")).resolves.toEqual({
      options: { challenge: "abc" },
      ceremonyToken: "cer",
    });
  });

  it("refuses a challenge that is not an object", async () => {
    stubApi({
      "POST /v1/login/passkey/begin": () =>
        jsonResponse({ data: { public_key: "not-an-object", ceremony_token: "cer" } }),
    });
    const error = await beginPasskey("pending").catch((e: unknown) => e);
    expect((error as CrydenError).kind).toBe("malformed");
  });
});

describe("building a session", () => {
  const sessions = {
    "GET /v1/sessions": () =>
      jsonResponse({
        data: [
          { id: "old", label: "l", created_at: "2026-01-01T00:00:00Z", user_agent: "", ip: "" },
          { id: "new", label: "l", created_at: "2026-01-02T00:00:00Z", user_agent: "", ip: "" },
        ],
      }),
  };

  it("takes the operator from the token and the newest API session as its own", async () => {
    stubApi(sessions);
    const session = await sessionFromTokens(
      {
        accessToken: accessToken({ sub: "user-9", role: "admin", exp: NOW_SECONDS + 900 }),
        refreshToken: "rt",
      },
      "op@example.invalid",
    );

    expect(session.operator).toEqual({ id: "user-9", label: "op@example.invalid", role: "admin" });
    expect(session.apiSessionId).toBe("new");
    expect(session.api.expiresAt).toBe((NOW_SECONDS + 900) * 1000);
    // A CSRF value the browser can echo, and a console session id of its own.
    expect(session.csrf).toHaveLength(43);
    expect(session.sid).not.toBe("");
  });

  it("still signs the operator in when the session list cannot be read", async () => {
    // Losing the API session id costs the ability to revoke at sign-out. It must
    // not cost the sign-in.
    stubApi({
      "GET /v1/sessions": () => jsonResponse({ error: { code: "not_configured" } }, 404),
    });
    const session = await sessionFromTokens(
      {
        accessToken: accessToken({ sub: "u", role: "admin", exp: NOW_SECONDS + 900 }),
        refreshToken: "rt",
      },
      "op@example.invalid",
    );
    expect(session.apiSessionId).toBeNull();
  });

  it("refuses a token whose subject it cannot read", async () => {
    stubApi({});
    const error = await sessionFromTokens(
      { accessToken: "not-a-jwt", refreshToken: "rt" },
      "op@example.invalid",
    ).catch((e: unknown) => e);
    expect((error as CrydenError).kind).toBe("malformed");
  });
});

describe("signing in", () => {
  it("walks the password step to a session", async () => {
    stubApi({
      "POST /v1/login": () =>
        jsonResponse({
          data: {
            access_token: accessToken({ sub: "u1", role: "admin", exp: NOW_SECONDS + 900 }),
            refresh_token: "rt",
          },
        }),
      "GET /v1/sessions": () =>
        jsonResponse({
          data: [
            { id: "s1", label: "l", created_at: "2026-01-01T00:00:00Z", user_agent: "", ip: "" },
          ],
        }),
    });

    const outcome = await signIn("op@example.invalid", "pw");
    expect(outcome.kind).toBe("session");
    if (outcome.kind !== "session") throw new Error("unreachable");
    expect(outcome.session.operator.role).toBe("admin");
  });

  it("returns the pause without inventing a session", async () => {
    stubApi({
      "POST /v1/login": () =>
        jsonResponse({
          data: { second_factor_required: true, pending_token: "p", methods: ["webauthn"] },
        }),
    });

    const outcome = await signIn("op@example.invalid", "pw");
    expect(outcome).toEqual({
      kind: "second-factor",
      paused: { pendingToken: "p", methods: ["webauthn"] },
    });
  });

  it("completes a pause with a code, a recovery code or a passkey", async () => {
    const token = accessToken({ sub: "u2", role: "viewer", exp: NOW_SECONDS + 900 });
    stubApi({
      "GET /v1/sessions": () => jsonResponse({ data: [] }),
      "POST /v1/login/totp": () =>
        jsonResponse({ data: { access_token: token, refresh_token: "r1" } }),
      "POST /v1/login/recovery-code": () =>
        jsonResponse({ data: { access_token: token, refresh_token: "r2" } }),
      "POST /v1/login/passkey/finish": () =>
        jsonResponse({ data: { access_token: token, refresh_token: "r3" } }),
    });

    // An account with no role claim is a console viewer.
    expect((await sessionFromTotp(pausedLogin(), "123456")).operator.role).toBe("viewer");
    expect(
      (await sessionFromRecoveryCode(pausedLogin(["recovery_code"]), "abcd-efgh")).operator.id,
    ).toBe("u2");
    expect(
      (await sessionFromPasskey(pausedLogin(["webauthn"]), "cer", { id: "x" })).operator.id,
    ).toBe("u2");
  });

  it("sends the ceremony token it was given, not one from the caller", async () => {
    const seen = stubApi({
      "GET /v1/sessions": () => jsonResponse({ data: [] }),
      "POST /v1/login/passkey/finish": () =>
        jsonResponse({
          data: {
            access_token: accessToken({ sub: "u", role: "admin", exp: NOW_SECONDS + 900 }),
            refresh_token: "r",
          },
        }),
    });

    await sessionFromPasskey(pausedLogin(["webauthn"]), "from-the-cookie", { id: "cred" });
    expect(seen[0]?.body).toMatchObject({
      pending_token: "pending-token",
      ceremony_token: "from-the-cookie",
    });
  });
});

describe("renewing an access token", () => {
  function expiredSession(overrides: Partial<Session> = {}): Session {
    return {
      sid: "sid-1",
      apiSessionId: "api-1",
      operator: { id: "u", label: "op@example.invalid", role: "admin" },
      api: { accessToken: "old-access", refreshToken: "old-refresh", expiresAt: Date.now() - 1000 },
      csrf: "csrf-value",
      ...overrides,
    };
  }

  it("rotates the pair and keeps everything else", async () => {
    const seen = stubApi({
      "POST /v1/refresh": () =>
        jsonResponse({
          data: {
            access_token: accessToken({ sub: "u", role: "admin", exp: NOW_SECONDS + 900 }),
            refresh_token: "new-refresh",
          },
        }),
    });

    const renewal = await renewSession(expiredSession());
    expect(renewal.kind).toBe("session");
    if (renewal.kind !== "session") throw new Error("unreachable");

    expect(seen[0]?.body).toEqual({ refresh_token: "old-refresh" });
    expect(renewal.session.api.refreshToken).toBe("new-refresh");
    expect(renewal.session.api.expiresAt).toBe((NOW_SECONDS + 900) * 1000);
    // The console's own session survives the API's tokens turning over.
    expect(renewal.session.sid).toBe("sid-1");
    expect(renewal.session.csrf).toBe("csrf-value");
    expect(renewal.session.operator).toEqual(expiredSession().operator);
  });

  it("ends the session when the API says the token was reused", async () => {
    // The API answers a reused refresh token by revoking the whole chain, so
    // the only safe reading is to sign in again.
    stubApi({
      "POST /v1/refresh": () => jsonResponse({ error: { code: "token_reused" } }, 401),
    });
    await expect(renewSession(expiredSession())).resolves.toEqual({ kind: "expired" });
  });

  it("ends the session when the refresh token is not one the API knows", async () => {
    stubApi({ "POST /v1/refresh": () => jsonResponse({ error: { code: "invalid_token" } }, 401) });
    await expect(renewSession(expiredSession())).resolves.toEqual({ kind: "expired" });
  });

  it("does not sign anyone out over a blip", async () => {
    // An API that cannot be reached is reported as itself. Ending the session
    // here would turn a network fault into a forced sign-in.
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const error = await renewSession(expiredSession()).catch((e: unknown) => e);
    expect((error as CrydenError).kind).toBe("network");
  });
});

describe("signing out", () => {
  const session: Session = {
    sid: "sid-1",
    apiSessionId: "api-1",
    operator: { id: "u", label: "op@example.invalid", role: "admin" },
    api: { accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 600_000 },
    csrf: "csrf",
  };

  it("revokes the API session it recorded at sign-in", async () => {
    const seen = stubApi({
      "POST /v1/logout": () => jsonResponse({ data: { status: "logged out" } }),
    });
    await expect(signOut(session)).resolves.toEqual({ revoked: true });
    expect(seen[0]?.body).toEqual({ session_id: "api-1" });
    expect(seen[0]?.authorization).toBe("Bearer access");
  });

  it("reports that it could not revoke when there is no API session id", async () => {
    await expect(signOut({ ...session, apiSessionId: null })).resolves.toEqual({ revoked: false });
  });

  it("reports that it could not revoke when the API refuses or is unreachable", async () => {
    stubApi({
      "POST /v1/logout": () => jsonResponse({ error: { code: "session_not_owned" } }, 403),
    });
    await expect(signOut(session)).resolves.toEqual({ revoked: false });

    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await expect(signOut(session)).resolves.toEqual({ revoked: false });
  });
});

describe("the guards", () => {
  function requestFor(
    cookie: string | null,
    init: {
      origin?: string | null;
      host?: string | null;
      csrf?: string | null;
      method?: string;
    } = {},
  ): Request {
    const headers = new Headers();
    if (cookie !== null) headers.set("cookie", cookie);
    if (init.origin !== undefined && init.origin !== null) headers.set("origin", init.origin);
    if (init.host !== undefined && init.host !== null) headers.set("host", init.host);
    if (init.csrf !== undefined && init.csrf !== null) headers.set("x-csrf-token", init.csrf);
    return new Request("http://localhost:3000/api/thing", {
      method: init.method ?? "POST",
      headers,
    });
  }

  async function sessionCookie(session: Session): Promise<string> {
    return `${SESSION_COOKIE}=${await sealSession(session)}`;
  }

  function sessionAt(expiresAt: number, overrides: Partial<Session> = {}): Session {
    return {
      sid: "sid-1",
      apiSessionId: "api-1",
      operator: { id: "u", label: "op@example.invalid", role: "admin" },
      api: { accessToken: "access", refreshToken: "refresh", expiresAt },
      csrf: "the-csrf-value",
      ...overrides,
    };
  }

  it("refuses another origin before it looks at anything else", () => {
    const response = requireSameOrigin(requestFor(null, { origin: "http://evil.example" }));
    expect(response?.status).toBe(403);
    expect(requireSameOrigin(requestFor(null, { origin: ORIGIN, host: HOST }))).toBeNull();
    // A request with neither header is not a browser, and is left to the checks
    // that follow rather than refused here.
    expect(requireSameOrigin(requestFor(null, { origin: null, host: null }))).toBeNull();
  });

  it("refuses an anonymous request, and clears a cookie it cannot read", async () => {
    const anonymous = await requireSession(requestFor(null));
    expect(anonymous.ok).toBe(false);
    if (anonymous.ok) throw new Error("unreachable");
    expect(anonymous.response.status).toBe(401);
    // Nothing to clear when nothing was presented.
    expect(anonymous.response.headers.get("set-cookie")).toBeNull();

    const unreadable = await requireSession(requestFor("csax_session=rubbish"));
    expect(unreadable.ok).toBe(false);
    if (unreadable.ok) throw new Error("unreachable");
    expect(unreadable.response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("accepts a live session without touching the API", async () => {
    const seen = stubApi({});
    const guarded = await requireSession(
      requestFor(await sessionCookie(sessionAt(Date.now() + 600_000))),
    );

    expect(guarded.ok).toBe(true);
    if (!guarded.ok) throw new Error("unreachable");
    expect(guarded.role).toBe("admin");
    expect(guarded.setCookies).toEqual([]);
    expect(seen).toHaveLength(0);
  });

  it("renews a nearly expired token and hands back the cookie that records it", async () => {
    stubApi({
      "POST /v1/refresh": () =>
        jsonResponse({
          data: {
            access_token: accessToken({ sub: "u", role: "admin", exp: NOW_SECONDS + 900 }),
            refresh_token: "rotated",
          },
        }),
    });

    const guarded = await requireSession(
      requestFor(await sessionCookie(sessionAt(Date.now() + 5_000))),
    );
    expect(guarded.ok).toBe(true);
    if (!guarded.ok) throw new Error("unreachable");

    // Without this cookie the console would still hold a refresh token the API
    // has already revoked, and the next call would sign the operator out.
    expect(guarded.setCookies).toHaveLength(1);
    const renewed = await openSession(parseCookieHeader(guarded.setCookies[0]).get(SESSION_COOKIE));
    expect(renewed?.api.refreshToken).toBe("rotated");
    expect(renewed?.sid).toBe("sid-1");
  });

  it("attaches the renewed cookie to whatever answer it is given", async () => {
    stubApi({
      "POST /v1/refresh": () =>
        jsonResponse({
          data: {
            access_token: accessToken({ sub: "u", role: "admin", exp: NOW_SECONDS + 900 }),
            refresh_token: "rotated",
          },
        }),
    });

    const guarded = await requireSession(
      requestFor(await sessionCookie(sessionAt(Date.now() + 5_000))),
    );
    if (!guarded.ok) throw new Error("unreachable");

    const answered = guarded.respond(Response.json({ data: { ok: true } }));
    expect(answered.headers.get("set-cookie")).toContain(SESSION_COOKIE);
    await expect(answered.json()).resolves.toEqual({ data: { ok: true } });
  });

  it("clears the cookie when the API says the session chain is gone", async () => {
    stubApi({ "POST /v1/refresh": () => jsonResponse({ error: { code: "token_reused" } }, 401) });

    const guarded = await requireSession(
      requestFor(await sessionCookie(sessionAt(Date.now() + 5_000))),
    );
    expect(guarded.ok).toBe(false);
    if (guarded.ok) throw new Error("unreachable");
    expect(guarded.response.status).toBe(401);
    expect(guarded.response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("reports an unreachable API without signing the operator out", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });

    const guarded = await requireSession(
      requestFor(await sessionCookie(sessionAt(Date.now() + 5_000))),
    );
    expect(guarded.ok).toBe(false);
    if (guarded.ok) throw new Error("unreachable");
    expect(guarded.response.status).toBe(503);
    await expect(guarded.response.json()).resolves.toMatchObject({
      error: { code: ERROR_CODES.apiUnreachable },
    });
    // The cookie is left in place: the fault is not the operator's.
    expect(guarded.response.headers.get("set-cookie")).toBeNull();
  });

  it("lets an admin mutate when the origin and token both check out", async () => {
    const guarded = await requireMutation(
      requestFor(await sessionCookie(sessionAt(Date.now() + 600_000)), {
        origin: ORIGIN,
        host: HOST,
        csrf: "the-csrf-value",
      }),
    );
    expect(guarded.ok).toBe(true);
  });

  it("refuses a mutation with no token, another origin, or a viewer's role", async () => {
    const live = await sessionCookie(sessionAt(Date.now() + 600_000));

    const noToken = await requireMutation(requestFor(live, { origin: ORIGIN, host: HOST }));
    expect(noToken.ok).toBe(false);
    if (noToken.ok) throw new Error("unreachable");
    expect(noToken.response.status).toBe(403);
    await expect(noToken.response.json()).resolves.toMatchObject({
      error: { code: ERROR_CODES.csrf },
    });

    const wrongOrigin = await requireMutation(
      requestFor(live, { origin: "http://evil.example", csrf: "the-csrf-value" }),
    );
    expect(wrongOrigin.ok).toBe(false);

    const viewer = await requireMutation(
      requestFor(
        await sessionCookie(
          sessionAt(Date.now() + 600_000, { operator: { id: "u", label: "l", role: "viewer" } }),
        ),
        {
          origin: ORIGIN,
          host: HOST,
          csrf: "the-csrf-value",
        },
      ),
    );
    expect(viewer.ok).toBe(false);
    if (viewer.ok) throw new Error("unreachable");
    expect(viewer.response.status).toBe(403);
    await expect(viewer.response.json()).resolves.toMatchObject({
      error: { code: ERROR_CODES.forbidden, message: "Your role can read, not change." },
    });
  });

  it("asks an anonymous request to sign in before it mentions its origin", async () => {
    // The session is checked first, so a request that is not signed in is told
    // that, rather than being told about a CSRF token it could not have. An
    // answer that mentioned the origin here would be describing a check that had
    // not run yet.
    const guarded = await requireMutation(
      requestFor(null, { origin: "http://evil.example", csrf: "anything" }),
    );
    expect(guarded.ok).toBe(false);
    if (guarded.ok) throw new Error("unreachable");
    expect(guarded.response.status).toBe(401);
    await expect(guarded.response.json()).resolves.toMatchObject({
      error: { code: ERROR_CODES.unauthenticated },
    });
  });

  it("lets a viewer sign out, which is not a privileged change", async () => {
    const guarded = await requireCsrf(
      requestFor(
        await sessionCookie(
          sessionAt(Date.now() + 600_000, { operator: { id: "u", label: "l", role: "viewer" } }),
        ),
        { origin: ORIGIN, host: HOST, csrf: "the-csrf-value" },
      ),
    );
    expect(guarded.ok).toBe(true);
  });
});
