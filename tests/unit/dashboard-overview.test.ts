import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DIGEST_REPORT_UNAVAILABLE_DETAIL,
  NOT_OPERATOR_DETAIL,
  SQLITE_ADMIN_DETAIL,
} from "@/lib/dashboard";
import {
  DIGEST_REPORT_PATH,
  HASH_MIGRATION_PATH,
  MFA_ADOPTION_PATH,
  USERS_PATH,
  fetchUsers,
} from "@/server/cryden/admin";
import { DASHBOARD_WINDOW_DAYS, dashboardOverview } from "@/server/dashboard/overview";
import { resetConfigCache } from "@/server/config/index";

/**
 * How the dashboard's four reports are gathered and reported.
 *
 * The interesting behaviour is not that four requests are made. It is what
 * happens when some of them fail: which code becomes which kind of state, and
 * whether one failure is allowed to take the other three with it.
 *
 * `fetchUsers` is wrapped rather than replaced, so every other case still goes
 * through the real transport against a stubbed `fetch`. The wrapper exists to
 * reach the one branch a stubbed HTTP call cannot produce: something throwing
 * that the transport does not map.
 */
vi.mock("@/server/cryden/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/cryden/admin")>();
  return { ...actual, fetchUsers: vi.fn(actual.fetchUsers) };
});

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

beforeEach(() => {
  useEnvironment();
  vi.mocked(fetchUsers).mockClear();
});

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

const ACCOUNTS = [
  {
    id: "01J0000000000000000000000B",
    email: "newest@example.invalid",
    created_at: "2026-10-04T09:00:00Z",
    updated_at: "2026-10-04T09:00:00Z",
    failed_attempts: 0,
    locked: false,
    locked_until: null,
  },
  {
    id: "01J0000000000000000000000A",
    email: "older@example.invalid",
    created_at: "2026-09-01T09:00:00Z",
    updated_at: "2026-10-01T09:00:00Z",
    failed_attempts: 4,
    locked: true,
    locked_until: "2026-10-05T09:15:00Z",
  },
];

const DIGEST_TEXT = "Security digest\n\nNothing needs attention.\n";

/** Answers each of the four admin routes with whatever this test wants it to. */
function stubApi(
  routes: Partial<
    Record<
      | typeof USERS_PATH
      | typeof MFA_ADOPTION_PATH
      | typeof HASH_MIGRATION_PATH
      | typeof DIGEST_REPORT_PATH,
      () => Response
    >
  >,
): string[] {
  const asked: string[] = [];

  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    asked.push(url.pathname);

    const route = routes[url.pathname as keyof typeof routes];
    if (route === undefined) {
      return jsonResponse({ error: { code: "unexpected_route", message: url.pathname } }, 500);
    }
    return route();
  });

  return asked;
}

const ALL_OK = {
  [USERS_PATH]: () =>
    jsonResponse({
      data: { users: ACCOUNTS, total: 41, limit: 5, offset: 0, match: "browse", query: "" },
    }),
  [MFA_ADOPTION_PATH]: () =>
    jsonResponse({
      data: {
        total_users: 41,
        window_days: DASHBOARD_WINDOW_DAYS,
        factors: [
          {
            factor: "totp",
            enrolled_events: 12,
            removed_events: 3,
            enrolled_events_in_window: 2,
            removed_events_in_window: 1,
          },
        ],
      },
    }),
  [HASH_MIGRATION_PATH]: () =>
    jsonResponse({
      data: {
        hasher: { algorithm: "argon2id" },
        total_users: 41,
        upgraded_events: 39,
        estimated_remaining: 2,
        window_days: DASHBOARD_WINDOW_DAYS,
        upgraded_events_in_window: 5,
      },
    }),
  [DIGEST_REPORT_PATH]: () =>
    jsonResponse({
      data: {
        since: "2026-09-28T00:00:00Z",
        until: "2026-10-05T00:00:03Z",
        window_days: DASHBOARD_WINDOW_DAYS,
        text: DIGEST_TEXT,
      },
    }),
};

describe("gathering the dashboard", () => {
  it("reads all four reports, together", async () => {
    const asked = stubApi(ALL_OK);

    await dashboardOverview(TOKEN);

    expect(asked.sort()).toEqual(
      [USERS_PATH, MFA_ADOPTION_PATH, HASH_MIGRATION_PATH, DIGEST_REPORT_PATH].sort(),
    );
  });

  it("reports each section as the API answered it", async () => {
    stubApi(ALL_OK);

    const overview = await dashboardOverview(TOKEN);

    expect(overview.accounts).toEqual({
      state: "ok",
      data: { total: 41, newest: ACCOUNTS },
    });
    expect(overview.factors.state).toBe("ok");
    expect(overview.hashes.state).toBe("ok");
    expect(overview.digest).toEqual({
      state: "ok",
      data: expect.objectContaining({ text: DIGEST_TEXT }),
    });
  });

  it("takes the account total from the API and the newest page from the same answer", async () => {
    stubApi(ALL_OK);

    const overview = await dashboardOverview(TOKEN);
    if (overview.accounts.state !== "ok") throw new Error("expected the accounts to answer");

    // One more call would be one more thing to keep in step, and the list is
    // already ordered newest first by the API.
    expect(overview.accounts.data.total).toBe(41);
    expect(overview.accounts.data.newest).toHaveLength(2);
    expect(overview.accounts.data.newest[0]?.email).toBe("newest@example.invalid");
  });

  it("asks the second-factor and hash reports for the dashboard's window", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      seen.push(url.search);
      const route = ALL_OK[url.pathname as keyof typeof ALL_OK];
      return route === undefined ? jsonResponse({}, 500) : route();
    });

    await dashboardOverview(TOKEN);

    // The window is passed rather than assumed, and the reports echo it back, so
    // the copy beside a count describes the range the API actually used.
    expect(seen.filter((search) => search.includes("window_days"))).toEqual([
      `?window_days=${DASHBOARD_WINDOW_DAYS}`,
      `?window_days=${DASHBOARD_WINDOW_DAYS}`,
      `?window_days=${DASHBOARD_WINDOW_DAYS}`,
    ]);
  });

  it("sends the operator's token on every read", async () => {
    const authorizations: Array<string | null> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      authorizations.push(new Headers(init?.headers).get("authorization"));
      const route = ALL_OK[new URL(String(input)).pathname as keyof typeof ALL_OK];
      return route === undefined ? jsonResponse({}, 500) : route();
    });

    await dashboardOverview(TOKEN);

    expect(authorizations).toHaveLength(4);
    for (const header of authorizations) expect(header).toBe(`Bearer ${TOKEN}`);
  });
});

describe("a failure in one section", () => {
  it("does not take the other three with it", async () => {
    stubApi({
      ...ALL_OK,
      [USERS_PATH]: () => jsonResponse({ error: { code: "internal_error", message: "boom" } }, 500),
    });

    const overview = await dashboardOverview(TOKEN);

    expect(overview.accounts).toEqual({
      state: "error",
      detail: "boom",
      code: "internal_error",
    });
    // The point of the section states: three answers arrived, and a screen that
    // went blank would hide them behind one that did not.
    expect(overview.factors.state).toBe("ok");
    expect(overview.hashes.state).toBe("ok");
    expect(overview.digest.state).toBe("ok");
  });

  it("keeps the API's message and code for the operator and the log", async () => {
    stubApi({
      ...ALL_OK,
      [HASH_MIGRATION_PATH]: () =>
        jsonResponse({ error: { code: "internal_error", message: "hasher unavailable" } }, 500),
    });

    const overview = await dashboardOverview(TOKEN);
    expect(overview.hashes).toEqual({
      state: "error",
      detail: "hasher unavailable",
      code: "internal_error",
    });
  });

  it("reports something the transport did not map as a console failure, with no code", async () => {
    stubApi(ALL_OK);
    vi.mocked(fetchUsers).mockRejectedValueOnce(new TypeError("this is a console bug"));

    const overview = await dashboardOverview(TOKEN);

    if (overview.accounts.state !== "error") throw new Error("expected an error state");
    // Null rather than a made-up code: there is no provider code to match
    // against a log, and inventing one would send an operator looking for it.
    expect(overview.accounts.code).toBeNull();
    expect(overview.accounts.detail).toContain("did not recognise the failure");
    expect(overview.factors.state).toBe("ok");
  });
});

describe("a deployment with no admin surface", () => {
  const sqlite = () =>
    jsonResponse(
      { error: { code: "not_implemented_on_sqlite", message: "not available on sqlite" } },
      501,
    );

  it("reads every SQLite refusal as unavailable rather than as a fault", async () => {
    stubApi({
      [USERS_PATH]: sqlite,
      [MFA_ADOPTION_PATH]: sqlite,
      [HASH_MIGRATION_PATH]: sqlite,
      [DIGEST_REPORT_PATH]: sqlite,
    });

    const overview = await dashboardOverview(TOKEN);

    for (const section of [overview.accounts, overview.factors, overview.hashes, overview.digest]) {
      expect(section.state).toBe("unavailable");
      if (section.state !== "unavailable") throw new Error("unreachable");
      expect(section.code).toBe("not_implemented_on_sqlite");
      expect(section.detail).toBe(SQLITE_ADMIN_DETAIL);
      expect(section.detail).toContain("Postgres");
    }
  });
});

describe("an account the API does not recognise as an operator", () => {
  const refused = () =>
    jsonResponse({ error: { code: "not_operator", message: "not an operator" } }, 403);

  it("reads the refusal as forbidden, and says the API is the one refusing", async () => {
    stubApi({
      [USERS_PATH]: refused,
      [MFA_ADOPTION_PATH]: refused,
      [HASH_MIGRATION_PATH]: refused,
      [DIGEST_REPORT_PATH]: refused,
    });

    const overview = await dashboardOverview(TOKEN);

    for (const section of [overview.accounts, overview.factors, overview.hashes, overview.digest]) {
      expect(section.state).toBe("forbidden");
      if (section.state !== "forbidden") throw new Error("unreachable");
      expect(section.code).toBe("not_operator");
      expect(section.detail).toBe(NOT_OPERATOR_DETAIL);
    }
  });

  it("is told apart from a failed call, which goes to a different place", async () => {
    stubApi({ ...ALL_OK, [USERS_PATH]: refused });

    const overview = await dashboardOverview(TOKEN);
    // 403 is not 500. One is the API saying no; the other is the API saying it
    // could not, and the operator's next move is different for each.
    expect(overview.accounts.state).toBe("forbidden");
    expect(overview.factors.state).toBe("ok");
  });
});

describe("the current digest", () => {
  it("reads a live seven-day report without relying on scheduled history", async () => {
    const asked = stubApi({ [DIGEST_REPORT_PATH]: ALL_OK[DIGEST_REPORT_PATH] });

    const overview = await dashboardOverview(TOKEN);

    expect(asked).toContain(DIGEST_REPORT_PATH);
    expect(asked).not.toContain("/v1/admin/digest/history");
    expect(overview.digest).toEqual({
      state: "ok",
      data: expect.objectContaining({ since: "2026-09-28T00:00:00Z", text: DIGEST_TEXT }),
    });
  });

  it("shows an honest empty state when the API cannot generate a report", async () => {
    stubApi({
      ...ALL_OK,
      [DIGEST_REPORT_PATH]: () =>
        jsonResponse({ error: { code: "not_configured", message: "not configured" } }, 404),
    });

    const overview = await dashboardOverview(TOKEN);

    expect(overview.digest).toEqual({ state: "empty", detail: DIGEST_REPORT_UNAVAILABLE_DETAIL });
    expect(overview.accounts.state).toBe("ok");
  });

  it("does not become unavailable just because another section did", async () => {
    stubApi({
      ...ALL_OK,
      [USERS_PATH]: () =>
        jsonResponse({ error: { code: "not_implemented_on_sqlite", message: "sqlite" } }, 501),
      [MFA_ADOPTION_PATH]: () =>
        jsonResponse({ error: { code: "not_implemented_on_sqlite", message: "sqlite" } }, 501),
    });

    const overview = await dashboardOverview(TOKEN);
    expect(overview.accounts.state).toBe("unavailable");
    expect(overview.hashes.state).toBe("ok");
    expect(overview.digest.state).toBe("ok");
  });
});
