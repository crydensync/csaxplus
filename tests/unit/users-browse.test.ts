import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXACT_EMAIL_MISS_DETAIL, NO_SUCH_ACCOUNT_DETAIL } from "@/lib/users";
import { resetConfigCache } from "@/server/config/index";
import { USERS_PATH } from "@/server/cryden/admin";
import { readUser, browseUsers } from "@/server/users/browse";

/**
 * How the Users screen's reads are gathered and reported.
 *
 * The interesting behaviour is not that the requests are made. It is which API
 * code becomes which kind of state, because two of them arrive as the same
 * status: a 404 carrying `not_found` is a record that is not there, and a 404
 * carrying `not_configured` is a feature whose store was never wired. The drawer
 * words those two very differently, so reading the status instead of the code
 * would put the wrong sentence on the screen.
 *
 * Everything goes through the real transport against a stubbed `fetch`, so what
 * is asserted is the answer the console actually accepts.
 */

const TOKEN = "a-token-that-is-not-a-real-one";
const USER_ID = "01J0000000000000000000000A";
const SESSION_SECRET = Buffer.alloc(32, 1).toString("base64");
const VAULT_KEY = Buffer.alloc(32, 2).toString("base64");

function useEnvironment() {
  process.env.CSAX_API_URL = "http://127.0.0.1:8080";
  process.env.CRYDEN_MODE = "live";
  process.env.CSAX_SESSION_SECRET = SESSION_SECRET;
  process.env.CSAX_VAULT_KEY = VAULT_KEY;
  process.env.WEBAUTHN_RP_ID = "localhost";
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

/**
 * Answers by path, so one case can have the account read succeed while the
 * metadata read is refused.
 */
function stubApi(byPath: Record<string, () => Response>): string[] {
  const seen: string[] = [];

  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    seen.push(url.pathname);
    const handler = byPath[url.pathname];
    if (handler === undefined) throw new Error(`no stub for ${url.pathname}`);
    return handler();
  });

  return seen;
}

const AN_ACCOUNT = {
  id: USER_ID,
  email: "operator@example.invalid",
  created_at: "2026-09-30T10:00:00Z",
  updated_at: "2026-09-30T10:00:00Z",
  failed_attempts: 0,
  locked: false,
  locked_until: null,
};

const A_USER_LIST = {
  users: [AN_ACCOUNT],
  total: 41,
  limit: 25,
  offset: 0,
  match: "browse",
  query: "",
};

const A_DETAIL = { user: AN_ACCOUNT, active_sessions: 2, recent_activity: [] };

const A_METADATA = {
  user_id: USER_ID,
  metadata: { plan: "scale" },
  reserved_claim_names: ["sub", "role"],
};

const REFUSALS = {
  sqlite: () =>
    jsonResponse(
      { error: { code: "not_implemented_on_sqlite", message: "not available on sqlite" } },
      501,
    ),
  notOperator: () => jsonResponse({ error: { code: "not_operator", message: "no" } }, 403),
  noStore: () => jsonResponse({ error: { code: "not_configured", message: "no store" } }, 404),
  notFound: () => jsonResponse({ error: { code: "not_found", message: "no such user" } }, 404),
  failed: () => jsonResponse({ error: { code: "internal_error", message: "boom" } }, 500),
};

describe("browsing accounts", () => {
  it("answers with the API's page, including which mode matched", async () => {
    stubApi({ [USERS_PATH]: () => jsonResponse({ data: A_USER_LIST }) });

    const page = await browseUsers({ token: TOKEN, limit: 25 });

    expect(page).toEqual({ state: "ok", data: A_USER_LIST });
  });

  it("reads a search that matched nothing as an answer, not as an empty feature", async () => {
    stubApi({
      [USERS_PATH]: () =>
        jsonResponse({ data: { ...A_USER_LIST, users: [], total: 0, match: "exact_email" } }),
    });

    const page = await browseUsers({ token: TOKEN, limit: 25, query: "nobody@example.invalid" });

    // `ok` with a short list. `empty` is reserved for a feature that has no
    // backing store, which is a different thing to put on the screen: one says
    // the search missed, the other says the deployment cannot answer at all.
    expect(page.state).toBe("ok");
    if (page.state !== "ok") throw new Error("unreachable");
    expect(page.data.users).toEqual([]);
    expect(page.data.match).toBe("exact_email");
    // Which is why the miss needs its own sentence, and why the screen has one.
    expect(EXACT_EMAIL_MISS_DETAIL).toContain("character for character");
  });

  it("reads a SQLite deployment as having no admin surface rather than as a fault", async () => {
    stubApi({ [USERS_PATH]: REFUSALS.sqlite });

    const page = await browseUsers({ token: TOKEN });

    expect(page.state).toBe("unavailable");
    if (page.state !== "unavailable") throw new Error("unreachable");
    expect(page.code).toBe("not_implemented_on_sqlite");
    expect(page.detail).toContain("Postgres");
  });

  it("reads an operator refusal as the API's decision, not as a broken call", async () => {
    stubApi({ [USERS_PATH]: REFUSALS.notOperator });

    const page = await browseUsers({ token: TOKEN });

    expect(page.state).toBe("forbidden");
    if (page.state !== "forbidden") throw new Error("unreachable");
    expect(page.code).toBe("not_operator");
  });

  it("reads a deployment with no user store as an empty state, worded for the list", async () => {
    stubApi({ [USERS_PATH]: REFUSALS.noStore });

    const page = await browseUsers({ token: TOKEN });

    expect(page.state).toBe("empty");
    if (page.state !== "empty") throw new Error("unreachable");
    expect(page.detail).toContain("the account list");
  });

  it("keeps a failed call as an error, with the API's own message", async () => {
    stubApi({ [USERS_PATH]: REFUSALS.failed });

    const page = await browseUsers({ token: TOKEN });

    expect(page).toEqual({ state: "error", detail: "boom", code: "internal_error" });
  });

  it("reports an answer it cannot read as a console failure, with no code", async () => {
    stubApi({ [USERS_PATH]: () => jsonResponse({ data: { users: "not an array" } }) });

    const page = await browseUsers({ token: TOKEN });

    if (page.state !== "error") throw new Error("expected an error state");
    // Null rather than a made-up code: there is no provider code to match
    // against a log, and inventing one would send an operator looking for it.
    expect(page.code).toBeNull();
    expect(page.detail).toContain("the account list");
  });
});

describe("reading one account", () => {
  it("asks for the account and its metadata together", async () => {
    const seen = stubApi({
      [`${USERS_PATH}/${USER_ID}`]: () => jsonResponse({ data: A_DETAIL }),
      [`${USERS_PATH}/${USER_ID}/metadata`]: () => jsonResponse({ data: A_METADATA }),
    });

    const user = await readUser({ token: TOKEN, userId: USER_ID });

    expect(seen).toHaveLength(2);
    expect(user.detail).toEqual({ state: "ok", data: A_DETAIL });
    expect(user.metadata).toEqual({ state: "ok", data: A_METADATA });
  });

  it("reads a `not_found` as a record that is not there", async () => {
    stubApi({
      [`${USERS_PATH}/${USER_ID}`]: REFUSALS.notFound,
      [`${USERS_PATH}/${USER_ID}/metadata`]: REFUSALS.notFound,
    });

    const user = await readUser({ token: TOKEN, userId: USER_ID });

    for (const section of [user.detail, user.metadata]) {
      expect(section.state).toBe("empty");
      if (section.state !== "empty") throw new Error("unreachable");
      expect(section.detail).toBe(NO_SUCH_ACCOUNT_DETAIL);
    }
  });

  it("reads a `not_configured` 404 as a missing store, not as a missing account", async () => {
    stubApi({
      [`${USERS_PATH}/${USER_ID}`]: REFUSALS.noStore,
      [`${USERS_PATH}/${USER_ID}/metadata`]: REFUSALS.noStore,
    });

    const user = await readUser({ token: TOKEN, userId: USER_ID });

    // The same status as the case above and a different sentence, which is the
    // whole reason the code is read instead of the status.
    for (const [section, what] of [
      [user.detail, "the account"],
      [user.metadata, "metadata"],
    ] as const) {
      expect(section.state).toBe("empty");
      if (section.state !== "empty") throw new Error("unreachable");
      expect(section.detail).not.toBe(NO_SUCH_ACCOUNT_DETAIL);
      expect(section.detail).toContain(what);
    }
  });

  it("shows the account even when its metadata cannot be read", async () => {
    stubApi({
      [`${USERS_PATH}/${USER_ID}`]: () => jsonResponse({ data: A_DETAIL }),
      [`${USERS_PATH}/${USER_ID}/metadata`]: REFUSALS.failed,
    });

    const user = await readUser({ token: TOKEN, userId: USER_ID });

    // Metadata lives in the API's own table while the account comes from the
    // engine's stores, so one answering and the other not is an ordinary
    // deployment rather than a broken one.
    expect(user.detail.state).toBe("ok");
    expect(user.metadata).toEqual({
      state: "error",
      detail: "boom",
      code: "internal_error",
    });
  });

  it("still reports the metadata when the account itself is refused", async () => {
    stubApi({
      [`${USERS_PATH}/${USER_ID}`]: REFUSALS.failed,
      [`${USERS_PATH}/${USER_ID}/metadata`]: () => jsonResponse({ data: A_METADATA }),
    });

    const user = await readUser({ token: TOKEN, userId: USER_ID });

    expect(user.detail.state).toBe("error");
    expect(user.metadata.state).toBe("ok");
  });

  it("names the section each failure belongs to", async () => {
    stubApi({
      [`${USERS_PATH}/${USER_ID}`]: () => jsonResponse({ data: { active_sessions: 1 } }),
      [`${USERS_PATH}/${USER_ID}/metadata`]: REFUSALS.noStore,
    });

    const user = await readUser({ token: TOKEN, userId: USER_ID });

    // A malformed account body is a console-side failure and says which read it
    // came from, so the two panels cannot be confused for each other.
    if (user.detail.state !== "error") throw new Error("expected an error state");
    expect(user.detail.detail).toContain("the account");
  });
});
