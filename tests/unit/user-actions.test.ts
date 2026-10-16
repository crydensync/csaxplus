import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE as UNLINK } from "@/app/api/console/users/[userId]/oauth/[provider]/route";
import { POST as ACTION } from "@/app/api/console/users/[userId]/[action]/route";
import { POST as CREATE } from "@/app/api/console/users/route";
import { SESSION_COOKIE, sealSession, type Session } from "@/server/auth/session";
import {
  createUser,
  performUserAction,
  unlinkUserOAuth,
  userActionPath,
  userOAuthPath,
} from "@/server/cryden/admin";
import { CrydenError } from "@/server/cryden/http";
import { resetConfigCache } from "@/server/config/index";

/**
 * The admin user actions, at both boundaries.
 *
 * The client functions are tested against a stubbed `fetch`, so what is
 * asserted is the request the console sends and the answer it accepts. The
 * routes are tested as the browser calls them, for the part the client's own
 * tests cannot reach: that the mutation guard runs in front of every one of
 * them, and that what the route hands the API is the session's token rather
 * than anything the browser sent.
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

const AN_ACCOUNT = {
  id: "01J0000000000000000000000A",
  email: "someone@example.invalid",
  created_at: "2026-09-30T10:00:00Z",
  updated_at: "2026-09-30T10:00:00Z",
  failed_attempts: 3,
  locked: true,
  locked_until: "2026-10-13T12:00:00Z",
};

/** The answer every action returns: the account as it stands afterwards. */
function anActionAnswer(detail?: string): unknown {
  return { data: { user: { ...AN_ACCOUNT, locked: false, failed_attempts: 0 }, detail } };
}

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
  init: { method?: string; body?: unknown; csrf?: string | null; origin?: string } = {},
): Promise<Request> {
  const headers = new Headers({ origin: init.origin ?? "http://localhost:3000" });
  if (session !== null) headers.set("cookie", `${SESSION_COOKIE}=${await sealSession(session)}`);
  const csrf = init.csrf === undefined ? session?.csrf : init.csrf;
  if (csrf !== null && csrf !== undefined) headers.set("x-csrf-token", csrf);
  if (init.body !== undefined) headers.set("content-type", "application/json");

  return new Request("http://localhost:3000/api/console/users", {
    method: init.method ?? "POST",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

function actionParams(userId: string, action: string) {
  return { params: Promise.resolve({ userId, action }) };
}

function oauthParams(userId: string, provider: string) {
  return { params: Promise.resolve({ userId, provider }) };
}

describe("the admin action paths", () => {
  it("builds one path per action, with mfa's two segments", () => {
    expect(userActionPath(AN_ACCOUNT.id, "unlock")).toBe(`/v1/admin/users/${AN_ACCOUNT.id}/unlock`);
    expect(userActionPath(AN_ACCOUNT.id, "mfa-disable")).toBe(
      `/v1/admin/users/${AN_ACCOUNT.id}/mfa/disable`,
    );
  });

  it("refuses an id that would become different path syntax", () => {
    expect(userActionPath("../../etc", "unlock")).toBeNull();
    expect(userActionPath("a/b", "unlock")).toBeNull();
    expect(userOAuthPath(AN_ACCOUNT.id, "../../etc")).toBeNull();
    // A provider name is lowercase letters, digits and a dash; the engine's
    // configured providers are all spelled that way and nothing wider is sent.
    expect(userOAuthPath(AN_ACCOUNT.id, "Google")).toBeNull();
  });
});

describe("the action calls against the API", () => {
  it("posts to the action's own path under the operator's token, and reads the account back", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer()));

    const result = await performUserAction({
      token: TOKEN,
      userId: AN_ACCOUNT.id,
      action: "unlock",
    });

    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.path).toBe(`/v1/admin/users/${AN_ACCOUNT.id}/unlock`);
    expect(seen[0]?.authorization).toBe(`Bearer ${TOKEN}`);
    expect(result.user.locked).toBe(false);
  });

  it("answers a 201 create with the account inside it", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer(), 201));

    const user = await createUser({
      token: TOKEN,
      email: "new@example.invalid",
      password: "correct horse battery staple",
    });

    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.path).toBe("/v1/admin/users");
    expect(seen[0]?.body).toEqual({
      email: "new@example.invalid",
      password: "correct horse battery staple",
    });
    expect(user.email).toBe("someone@example.invalid");
  });

  it("sends the unlink as DELETE to the provider's own path", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer("unlinked github")));

    const result = await unlinkUserOAuth({
      token: TOKEN,
      userId: AN_ACCOUNT.id,
      provider: "github",
    });

    expect(seen[0]?.method).toBe("DELETE");
    expect(seen[0]?.path).toBe(`/v1/admin/users/${AN_ACCOUNT.id}/oauth/github`);
    expect(result.detail).toBe("unlinked github");
  });

  it("passes the API's refusal through with its own code and wording", async () => {
    stubApi(() =>
      jsonResponse(
        { error: { code: "user_exists", message: "an account with this email already exists" } },
        409,
      ),
    );

    const error = await createUser({
      token: TOKEN,
      email: "taken@example.invalid",
      password: "correct horse battery staple",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CrydenError);
    expect((error as CrydenError).code).toBe("user_exists");
  });
});

describe("POST /api/console/users (create)", () => {
  it("forwards the email and password to the API and answers 201 with the account", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer(), 201));

    const response = await CREATE(
      await request(SESSION, { body: { email: "new@example.invalid", password: "a-password" } }),
    );

    expect(response.status).toBe(201);
    expect((await response.json()).data.user.email).toBe("someone@example.invalid");
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.path).toBe("/v1/admin/users");
    expect(seen[0]?.body).toEqual({ email: "new@example.invalid", password: "a-password" });
  });

  it("refuses a viewer, who may read and not change", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer()));

    const response = await CREATE(
      await request(
        { ...SESSION, operator: { ...SESSION.operator, role: "viewer" } },
        { body: { email: "new@example.invalid", password: "a-password" } },
      ),
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("forbidden");
    expect(seen).toEqual([]);
  });

  it("refuses a request without the session's CSRF token", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer()));

    const response = await CREATE(
      await request(SESSION, { body: { email: "n@e.invalid", password: "p" }, csrf: null }),
    );

    expect(response.status).toBe(403);
    expect(seen).toEqual([]);
  });

  it("refuses a body without both fields, without calling the API", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer()));

    const response = await CREATE(
      await request(SESSION, { body: { email: "only@example.invalid" } }),
    );

    expect(response.status).toBe(400);
    expect(seen).toEqual([]);
  });

  it("passes the API's duplicate-account refusal through with its own code", async () => {
    stubApi(() =>
      jsonResponse(
        { error: { code: "user_exists", message: "an account with this email already exists" } },
        409,
      ),
    );

    const response = await CREATE(
      await request(SESSION, { body: { email: "taken@example.invalid", password: "a-password" } }),
    );

    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("user_exists");
  });
});

describe("POST /api/console/users/{userId}/{action}", () => {
  it("relays the action under the operator's token and answers with the account", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer()));

    const response = await ACTION(await request(SESSION), actionParams(AN_ACCOUNT.id, "unlock"));

    expect(await response.json()).toEqual({
      data: { user: { ...AN_ACCOUNT, locked: false, failed_attempts: 0 } },
    });
    expect(seen[0]?.path).toBe(`/v1/admin/users/${AN_ACCOUNT.id}/unlock`);
    expect(seen[0]?.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("answers 404 for a verb this console does not offer, without calling the API", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer()));

    const response = await ACTION(await request(SESSION), actionParams(AN_ACCOUNT.id, "delete"));

    expect(response.status).toBe(404);
    expect(seen).toEqual([]);
  });

  it("refuses an id that is not a plain segment, without calling the API", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer()));

    const response = await ACTION(await request(SESSION), actionParams("../users", "unlock"));

    expect(response.status).toBe(400);
    expect(seen).toEqual([]);
  });

  it("refuses an anonymous caller before asking the API anything", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer()));

    const response = await ACTION(await request(null), actionParams(AN_ACCOUNT.id, "unlock"));

    expect(response.status).toBe(401);
    expect(seen).toEqual([]);
  });

  it("refuses a viewer before the call", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer()));

    const response = await ACTION(
      await request({ ...SESSION, operator: { ...SESSION.operator, role: "viewer" } }),
      actionParams(AN_ACCOUNT.id, "suspend"),
    );

    expect(response.status).toBe(403);
    expect(seen).toEqual([]);
  });
});

describe("DELETE /api/console/users/{userId}/oauth/{provider}", () => {
  it("sends the unlink to the provider's own path", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer("unlinked github")));

    const response = await UNLINK(
      await request(SESSION, { method: "DELETE" }),
      oauthParams(AN_ACCOUNT.id, "github"),
    );

    expect(await response.json()).toEqual({
      data: {
        user: { ...AN_ACCOUNT, locked: false, failed_attempts: 0 },
        detail: "unlinked github",
      },
    });
    expect(seen[0]?.method).toBe("DELETE");
    expect(seen[0]?.path).toBe(`/v1/admin/users/${AN_ACCOUNT.id}/oauth/github`);
  });

  it("refuses a provider name that is not the engine's shape, without calling the API", async () => {
    const seen = stubApi(() => jsonResponse(anActionAnswer()));

    const response = await UNLINK(
      await request(SESSION, { method: "DELETE" }),
      oauthParams(AN_ACCOUNT.id, "Not A Provider"),
    );

    expect(response.status).toBe(400);
    expect(seen).toEqual([]);
  });

  it("answers 404 for a provider the account never linked, with the API's own sentence", async () => {
    stubApi(() =>
      jsonResponse({ error: { code: "not_found", message: "resource not found" } }, 404),
    );

    const response = await UNLINK(
      await request(SESSION, { method: "DELETE" }),
      oauthParams(AN_ACCOUNT.id, "github"),
    );

    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("not_found");
  });
});
