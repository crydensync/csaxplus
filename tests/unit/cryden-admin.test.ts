import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DASHBOARD_DIGEST_LIMIT,
  DASHBOARD_USER_LIMIT,
  DIGEST_HISTORY_PATH,
  HASH_MIGRATION_PATH,
  MFA_ADOPTION_PATH,
  OAUTH_PROVIDERS_PATH,
  USERS_PATH,
  fetchDigestHistory,
  fetchHashMigration,
  fetchMfaAdoption,
  fetchOAuthProviders,
  fetchUserDetail,
  fetchUserMetadata,
  fetchUsers,
  testOAuthProvider,
} from "@/server/cryden/admin";
import { CrydenError } from "@/server/cryden/http";
import { resetConfigCache } from "@/server/config/index";

/**
 * The admin reads, at the boundary where they meet the API.
 *
 * Every case here goes through the real transport against a stubbed `fetch`, so
 * what is asserted is the request the console actually sends and the answer it
 * actually accepts, rather than a mock's idea of either.
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

type Seen = { path: string; search: string; method?: string; authorization: string | null };

/** Records the requests the console made, and answers each with `handler`'s reply. */
function stubApi(handler: () => Response): Seen[] {
  const seen: Seen[] = [];

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push({
      path: url.pathname,
      search: url.search,
      method: init?.method,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return handler();
  });

  return seen;
}

const AN_ACCOUNT = {
  id: "01J0000000000000000000000A",
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
  limit: DASHBOARD_USER_LIMIT,
  offset: 0,
  match: "browse",
  query: "",
};

const A_HASH_REPORT = {
  hasher: { algorithm: "argon2id", memory_kib: 65536, iterations: 3, parallelism: 4 },
  total_users: 41,
  upgraded_events: 39,
  estimated_remaining: 2,
  window_days: 7,
  upgraded_events_in_window: 5,
};

const AN_MFA_REPORT = {
  total_users: 41,
  window_days: 7,
  factors: [
    {
      factor: "totp",
      enrolled_events: 12,
      removed_events: 3,
      enrolled_events_in_window: 2,
      removed_events_in_window: 1,
    },
    {
      factor: "passkey",
      enrolled_events: 7,
      removed_events: 0,
      enrolled_events_in_window: 1,
      removed_events_in_window: 0,
    },
  ],
};

const A_DIGEST_RUN = {
  id: 9,
  window_start: "2026-09-28T00:00:00Z",
  window_end: "2026-10-05T00:00:00Z",
  generated_at: "2026-10-05T00:00:03Z",
  text: "Security digest\n\nNothing needs attention.",
};

const A_PROVIDER_LIST = {
  providers: [
    { provider: "google", configured: true },
    { provider: "github", configured: false },
  ],
};

const A_PROVIDER_VERDICT = {
  provider: "google",
  configured: true,
  status: "ok",
  http_status: 400,
  latency_ms: 42,
};

describe("reading accounts", () => {
  it("asks for the dashboard's page of accounts and sends the operator's token", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_USER_LIST }));

    await expect(fetchUsers({ token: TOKEN })).resolves.toEqual(A_USER_LIST);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.path).toBe(USERS_PATH);
    // The default limit is the dashboard's, so a caller that has not thought
    // about paging does not silently get the API's own default of everything.
    expect(seen[0]?.search).toBe(`?limit=${DASHBOARD_USER_LIMIT}`);
    expect(seen[0]?.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("passes an offset through when one is asked for", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_USER_LIST }));

    await fetchUsers({ token: TOKEN, limit: 25, offset: 50 });

    expect(seen[0]?.search).toBe("?limit=25&offset=50");
  });

  it("keeps the API's total rather than counting the page it was given", async () => {
    stubApi(() => jsonResponse({ data: A_USER_LIST }));

    // One account came back and forty-one exist. A screen that showed the length
    // of the list would be wrong the moment there was a second page, so the
    // total has to survive the trip.
    const list = await fetchUsers({ token: TOKEN });
    expect(list.users).toHaveLength(1);
    expect(list.total).toBe(41);
  });

  it("keeps `locked` as the API computed it, not as the column reads", async () => {
    stubApi(() =>
      jsonResponse({
        data: {
          ...A_USER_LIST,
          users: [
            {
              ...AN_ACCOUNT,
              failed_attempts: 5,
              locked: false,
              locked_until: "2026-09-30T10:15:00Z",
            },
          ],
        },
      }),
    );

    const list = await fetchUsers({ token: TOKEN });
    expect(list.users[0]?.locked).toBe(false);
    expect(list.users[0]?.locked_until).toBe("2026-09-30T10:15:00Z");
  });

  it("refuses an answer with a field missing instead of rendering an undefined one", async () => {
    const { locked: _dropped, ...withoutLocked } = AN_ACCOUNT;
    stubApi(() => jsonResponse({ data: { ...A_USER_LIST, users: [withoutLocked] } }));

    await expect(fetchUsers({ token: TOKEN })).rejects.toBeInstanceOf(CrydenError);
    await expect(fetchUsers({ token: TOKEN })).rejects.toMatchObject({
      kind: "malformed",
      code: null,
    });
  });

  it("names the route it could not read, so the failure can be chased", async () => {
    stubApi(() => jsonResponse({ data: { users: "not an array" } }));
    await expect(fetchUsers({ token: TOKEN })).rejects.toThrow(USERS_PATH);
  });

  it("passes the API's own refusal through with its code", async () => {
    stubApi(() =>
      jsonResponse(
        { error: { code: "not_implemented_on_sqlite", message: "not available on sqlite" } },
        501,
      ),
    );

    // The console has to be able to tell this apart from a call that failed, so
    // the code has to survive the transport rather than become a generic error.
    await expect(fetchUsers({ token: TOKEN })).rejects.toMatchObject({
      kind: "http",
      status: 501,
      code: "not_implemented_on_sqlite",
    });
  });

  it("sends a search as the API's own `q`, and echoes back which mode answered", async () => {
    const seen = stubApi(() =>
      jsonResponse({
        data: { ...A_USER_LIST, match: "exact_email", query: "operator@example.invalid" },
      }),
    );

    const list = await fetchUsers({ token: TOKEN, limit: 25, query: "operator@example.invalid" });

    expect(seen[0]?.search).toBe(`?limit=25&q=operator%40example.invalid`);
    // The mode is kept rather than inferred from whether the caller typed
    // something: only the API knows which one it ran, and the screen words a
    // miss differently depending on it.
    expect(list.match).toBe("exact_email");
    expect(list.query).toBe("operator@example.invalid");
  });

  it("omits `q` entirely when there is nothing to search for", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_USER_LIST }));

    await fetchUsers({ token: TOKEN, limit: 25, query: "" });

    // An empty `q=` is a search for nothing, not the absence of one, and the
    // API is entitled to read it either way. The console does not make it guess.
    expect(seen[0]?.search).toBe("?limit=25");
  });
});

describe("reading one account", () => {
  const DETAIL = {
    user: AN_ACCOUNT,
    active_sessions: 3,
    recent_activity: [
      {
        id: "01J0000000000000000000000E",
        type: "login_success",
        ip: "203.0.113.7",
        created_at: "2026-10-05T08:00:00Z",
      },
      {
        id: "01J0000000000000000000000F",
        type: "token_rotated",
        metadata: { family: "01J0000000000000000000000G" },
        created_at: "2026-10-05T07:00:00Z",
      },
    ],
  };

  it("asks for the account by id and keeps its session count", async () => {
    const seen = stubApi(() => jsonResponse({ data: DETAIL }));

    const detail = await fetchUserDetail({ token: TOKEN, userId: AN_ACCOUNT.id });

    expect(seen[0]?.path).toBe(`${USERS_PATH}/${AN_ACCOUNT.id}`);
    expect(seen[0]?.authorization).toBe(`Bearer ${TOKEN}`);
    expect(detail.active_sessions).toBe(3);
    expect(detail.user.email).toBe(AN_ACCOUNT.email);
  });

  it("keeps an event's metadata as the engine recorded it", async () => {
    stubApi(() => jsonResponse({ data: DETAIL }));

    const detail = await fetchUserDetail({ token: TOKEN, userId: AN_ACCOUNT.id });
    const [withIp, withMetadata] = detail.recent_activity;

    // Both optional and both passed through untouched: the keys are cryden's,
    // they differ per event type, and a console that renamed them would be
    // inventing a vocabulary the engine does not have.
    expect(withIp?.ip).toBe("203.0.113.7");
    expect(withIp?.metadata).toBeUndefined();
    expect(withMetadata?.metadata).toEqual({ family: "01J0000000000000000000000G" });
    expect(withMetadata?.ip).toBeUndefined();
  });

  it("lets the 404 through, because a missing record is the API's answer", async () => {
    stubApi(() => jsonResponse({ error: { code: "not_found", message: "no such user" } }, 404));

    await expect(fetchUserDetail({ token: TOKEN, userId: AN_ACCOUNT.id })).rejects.toMatchObject({
      kind: "http",
      status: 404,
      code: "not_found",
    });
  });

  it("refuses an answer with no account in it", async () => {
    stubApi(() => jsonResponse({ data: { active_sessions: 3, recent_activity: [] } }));

    await expect(fetchUserDetail({ token: TOKEN, userId: AN_ACCOUNT.id })).rejects.toThrow(
      `${USERS_PATH}/${AN_ACCOUNT.id}`,
    );
  });
});

describe("reading an account's metadata", () => {
  const METADATA = {
    user_id: AN_ACCOUNT.id,
    metadata: { plan: "scale", seats: 12, beta: true, tags: ["a", "b"] },
    reserved_claim_names: ["aud", "exp", "iat", "iss", "jti", "nbf", "role", "sub"],
  };

  it("asks under the account and keeps every value type", async () => {
    const seen = stubApi(() => jsonResponse({ data: METADATA }));

    const metadata = await fetchUserMetadata({ token: TOKEN, userId: AN_ACCOUNT.id });

    expect(seen[0]?.path).toBe(`${USERS_PATH}/${AN_ACCOUNT.id}/metadata`);
    // Arbitrary JSON, so nothing is coerced on the way through: a panel that
    // flattened a list or a number into a string would be rewriting a value that
    // ends up as a JWT claim.
    expect(metadata.metadata).toEqual(METADATA.metadata);
  });

  it("keeps the names the API said it would refuse", async () => {
    stubApi(() => jsonResponse({ data: METADATA }));

    // The rule lives in the API, so the console is told it rather than repeating
    // it. A key added to the reserved set on the API's side therefore reaches
    // the screen without a console change.
    const metadata = await fetchUserMetadata({ token: TOKEN, userId: AN_ACCOUNT.id });
    expect(metadata.reserved_claim_names).toContain("role");
    expect(metadata.reserved_claim_names).toContain("sub");
  });

  it("accepts an account that carries none", async () => {
    stubApi(() => jsonResponse({ data: { ...METADATA, metadata: {} } }));

    const metadata = await fetchUserMetadata({ token: TOKEN, userId: AN_ACCOUNT.id });
    expect(metadata.metadata).toEqual({});
  });
});

describe("reading the password hash report", () => {
  it("asks for the window it was given", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_HASH_REPORT }));

    await expect(fetchHashMigration({ token: TOKEN, windowDays: 7 })).resolves.toEqual(
      A_HASH_REPORT,
    );
    expect(seen[0]?.path).toBe(HASH_MIGRATION_PATH);
    expect(seen[0]?.search).toBe("?window_days=7");
  });

  it("asks for nothing extra when no window was given", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_HASH_REPORT }));

    await fetchHashMigration({ token: TOKEN });
    // Letting the API choose its own default is better than the console picking
    // one on its behalf, so the parameter is simply absent.
    expect(seen[0]?.search).toBe("");
  });

  it("accepts a hasher with no tuning parameters, which is what bcrypt reports", async () => {
    stubApi(() => jsonResponse({ data: { ...A_HASH_REPORT, hasher: { algorithm: "bcrypt" } } }));

    const report = await fetchHashMigration({ token: TOKEN, windowDays: 7 });
    expect(report.hasher.algorithm).toBe("bcrypt");
    expect(report.hasher.memory_kib).toBeUndefined();
  });

  it("carries the event counts through without turning them into users", async () => {
    stubApi(() => jsonResponse({ data: A_HASH_REPORT }));

    const report = await fetchHashMigration({ token: TOKEN, windowDays: 7 });
    // Named as events so a screen cannot quietly divide them by total_users.
    expect(report.upgraded_events).toBe(39);
    expect(report.upgraded_events_in_window).toBe(5);
    expect(report.estimated_remaining).toBe(2);
    expect(report.total_users).toBe(41);
  });

  it("refuses a report whose numbers arrived as strings", async () => {
    stubApi(() => jsonResponse({ data: { ...A_HASH_REPORT, total_users: "41" } }));
    await expect(fetchHashMigration({ token: TOKEN })).rejects.toThrow(HASH_MIGRATION_PATH);
  });
});

describe("reading second-factor adoption", () => {
  it("parses every factor the API reports, keeping their event counts apart", async () => {
    const seen = stubApi(() => jsonResponse({ data: AN_MFA_REPORT }));

    const adoption = await fetchMfaAdoption({ token: TOKEN, windowDays: 7 });
    expect(seen[0]?.path).toBe(MFA_ADOPTION_PATH);
    expect(adoption.factors.map((factor) => factor.factor)).toEqual(["totp", "passkey"]);
    expect(adoption.factors[0]).toMatchObject({
      enrolled_events: 12,
      removed_events: 3,
      enrolled_events_in_window: 2,
      removed_events_in_window: 1,
    });
  });

  it("accepts a report with no factors at all", async () => {
    stubApi(() => jsonResponse({ data: { total_users: 0, window_days: 7, factors: [] } }));

    const adoption = await fetchMfaAdoption({ token: TOKEN, windowDays: 7 });
    // A deployment nobody has enrolled on is not a failure, and the screen has
    // to be able to say "not reported" about a factor that is not in here.
    expect(adoption.factors).toEqual([]);
  });

  it("refuses a factor without its event counts", async () => {
    stubApi(() => jsonResponse({ data: { ...AN_MFA_REPORT, factors: [{ factor: "totp" }] } }));
    await expect(fetchMfaAdoption({ token: TOKEN })).rejects.toThrow(MFA_ADOPTION_PATH);
  });
});

describe("reading the digest history", () => {
  it("asks for the newest run only, and returns it", async () => {
    const seen = stubApi(() =>
      jsonResponse({ data: { runs: [A_DIGEST_RUN], count: 3, limit: DASHBOARD_DIGEST_LIMIT } }),
    );

    const history = await fetchDigestHistory({ token: TOKEN });
    expect(seen[0]?.path).toBe(DIGEST_HISTORY_PATH);
    expect(seen[0]?.search).toBe(`?limit=${DASHBOARD_DIGEST_LIMIT}`);
    expect(history.runs[0]?.text).toBe(A_DIGEST_RUN.text);
  });

  it("returns an empty history rather than throwing when none is stored", async () => {
    stubApi(() => jsonResponse({ data: { runs: [], count: 0, limit: 1 } }));

    // Different from the 404 below: this deployment has a schedule and has not
    // run it yet. The screen words the two states differently.
    const history = await fetchDigestHistory({ token: TOKEN });
    expect(history.runs).toEqual([]);
    expect(history.count).toBe(0);
  });

  it("lets the 404 through, because no schedule is a state and not a fault", async () => {
    stubApi(() =>
      jsonResponse({ error: { code: "not_configured", message: "no digest store" } }, 404),
    );

    await expect(fetchDigestHistory({ token: TOKEN })).rejects.toMatchObject({
      kind: "http",
      status: 404,
      code: "not_configured",
    });
  });

  it("keeps the report's text verbatim", async () => {
    const text = "Security digest\n\nNeeds attention\n  - 2 accounts locked\n";
    stubApi(() =>
      jsonResponse({ data: { runs: [{ ...A_DIGEST_RUN, text }], count: 1, limit: 1 } }),
    );

    // The engine rendered this when the run happened. Nothing re-renders it, so
    // the console must not either.
    const history = await fetchDigestHistory({ token: TOKEN });
    expect(history.runs[0]?.text).toBe(text);
  });

  it("refuses a run with no text at all", async () => {
    const { text: _dropped, ...withoutText } = A_DIGEST_RUN;
    stubApi(() => jsonResponse({ data: { runs: [withoutText], count: 1, limit: 1 } }));

    await expect(fetchDigestHistory({ token: TOKEN })).rejects.toThrow(DIGEST_HISTORY_PATH);
  });
});

describe("reading the OAuth provider list", () => {
  it("asks for the provider list without probing anything, and sends the operator's token", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_PROVIDER_LIST }));

    await expect(fetchOAuthProviders({ token: TOKEN })).resolves.toEqual(A_PROVIDER_LIST.providers);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.path).toBe(OAUTH_PROVIDERS_PATH);
    // No body is sent, and the method is the transport's default GET.
    expect(seen[0]?.method === undefined || seen[0]?.method === "GET").toBe(true);
    expect(seen[0]?.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("refuses a list whose rows carry no configured field", async () => {
    stubApi(() => jsonResponse({ data: { providers: [{ provider: "google" }] } }));

    await expect(fetchOAuthProviders({ token: TOKEN })).rejects.toThrow(OAUTH_PROVIDERS_PATH);
  });

  it("refuses an answer whose providers member is not an array", async () => {
    stubApi(() => jsonResponse({ data: { providers: "google" } }));

    await expect(fetchOAuthProviders({ token: TOKEN })).rejects.toThrow(OAUTH_PROVIDERS_PATH);
  });
});

describe("testing one OAuth provider", () => {
  it("sends the probe as a POST on the provider's own path, with the operator's token", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_PROVIDER_VERDICT }));

    await expect(testOAuthProvider({ token: TOKEN, provider: "google" })).resolves.toEqual(
      A_PROVIDER_VERDICT,
    );

    expect(seen).toHaveLength(1);
    // Not under /providers: the API registers the probe on
    // /v1/admin/oauth/{provider}/test, and the list path is its own resource.
    expect(seen[0]?.path).toBe("/v1/admin/oauth/google/test");
    expect(seen[0]?.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("refuses a name that is not a provider-name before anything is sent", async () => {
    const seen = stubApi(() => jsonResponse({ data: A_PROVIDER_VERDICT }));

    for (const name of ["../etc", "google/something", "", "Google", "a".repeat(33)]) {
      await expect(testOAuthProvider({ token: TOKEN, provider: name })).rejects.toMatchObject({
        kind: "malformed",
      });
    }

    // Nothing reached the API: the check happens where the URL is built.
    expect(seen).toHaveLength(0);
  });

  it("lets the API's not-configured refusal through with its own code", async () => {
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

    // The wording of that refusal is the server layer's decision, covered where
    // the sections are composed; here the client's job is to carry the code.
    await expect(testOAuthProvider({ token: TOKEN, provider: "github" })).rejects.toMatchObject({
      kind: "http",
      status: 404,
      code: "oauth_provider_not_configured",
    });
  });

  it("refuses a verdict with no status", async () => {
    const { status: _dropped, ...withoutStatus } = A_PROVIDER_VERDICT;
    stubApi(() => jsonResponse({ data: withoutStatus }));

    await expect(testOAuthProvider({ token: TOKEN, provider: "google" })).rejects.toThrow(
      "/v1/admin/oauth/google/test",
    );
  });
});
