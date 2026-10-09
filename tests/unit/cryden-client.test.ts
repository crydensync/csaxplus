import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  API_STATUSES,
  API_STATUS_DETAILS,
  API_STATUS_LABELS,
  apiStatusClass,
} from "@/lib/api-status";
import { initialsFromLabel } from "@/lib/operator";
import { crydenClient } from "@/server/cryden/client";
import { fetchHealth, HEALTH_PATH, HEALTH_TIMEOUT_MS } from "@/server/cryden/health";
import { resetConfigCache } from "@/server/config/index";

const SESSION_SECRET = Buffer.alloc(32, 1).toString("base64");
const VAULT_KEY = Buffer.alloc(32, 2).toString("base64");

function useEnvironment(mode: "live" | "fixtures") {
  process.env.CSAX_API_URL = "http://127.0.0.1:8080";
  process.env.CRYDEN_MODE = mode;
  process.env.CSAX_SESSION_SECRET = SESSION_SECRET;
  process.env.CSAX_VAULT_KEY = VAULT_KEY;
  process.env.WEBAUTHN_ORIGIN = "http://localhost:3000";
  resetConfigCache();
}

beforeEach(() => {
  useEnvironment("live");
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

/** Records what the health check asked the API for. */
function stubApi(handler: () => Response | Promise<Response>) {
  const seen: Array<{ method: string; path: string; authorization: string | null }> = [];

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return handler();
  });

  return seen;
}

describe("the health check", () => {
  it("asks the API and reports a healthy answer as connected", async () => {
    const seen = stubApi(() => jsonResponse({ data: { status: "ok" } }));

    await expect(fetchHealth()).resolves.toEqual({
      state: "api-client",
      detail: API_STATUS_DETAILS["api-client"],
    });

    expect(seen[0]?.method).toBe("GET");
    expect(seen[0]?.path).toBe(HEALTH_PATH);
    // Public on the API's side, and the console sends no token it does not need.
    expect(seen[0]?.authorization).toBeNull();
  });

  it("gives the tag a shorter wait than an ordinary call", () => {
    // A status line is not worth the transport's full ten seconds.
    expect(HEALTH_TIMEOUT_MS).toBeLessThan(10_000);
  });

  it("reads a database the API cannot reach as degraded, and says which code", async () => {
    stubApi(() =>
      jsonResponse({ error: { code: "db_unreachable", message: "database is unreachable" } }, 503),
    );

    const health = await fetchHealth();
    expect(health.state).toBe("degraded");
    if (health.state !== "degraded") throw new Error("unreachable");
    // Named, because this failure is the API being up and its database being
    // down, which is a different thing to tell an operator than "degraded".
    expect(health.code).toBe("db_unreachable");
    expect(health.detail).toContain("database");
  });

  it("reads any other failure the API reports as degraded, keeping its code", async () => {
    stubApi(() => jsonResponse({ error: { code: "internal_error", message: "no" } }, 500));

    const health = await fetchHealth();
    expect(health.state).toBe("degraded");
    if (health.state !== "degraded") throw new Error("unreachable");
    expect(health.code).toBe("internal_error");
  });

  it("reads an API it cannot reach as offline, with nothing invented", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });

    const health = await fetchHealth();
    expect(health.state).toBe("offline");
    if (health.state !== "offline") throw new Error("unreachable");
    expect(health.code).toBeNull();
    expect(health.detail).toBe(API_STATUS_DETAILS.offline);
  });

  it("fails closed: an answer it cannot read is not health", async () => {
    // A proxy's HTML error page, an empty body, and a status word the console
    // does not know. Each is an answer, and none of them is "the API is fine".
    stubApi(() => new Response("<html>hello</html>", { status: 200 }));
    expect((await fetchHealth()).state).toBe("degraded");

    stubApi(() => new Response("", { status: 200 }));
    expect((await fetchHealth()).state).toBe("degraded");

    stubApi(() => jsonResponse({ data: { status: "healthy" } }));
    const unknown = await fetchHealth();
    expect(unknown.state).toBe("degraded");
    if (unknown.state !== "degraded") throw new Error("unreachable");
    expect(unknown.code).toBe("unexpected_health_answer");
  });

  it("reports a failure instead of raising one, whatever the transport threw", async () => {
    // A screen renders this on every page, so a throw here would be a broken
    // console rather than a tag that says the API is down. Every kind of
    // transport failure has to arrive as a state.
    vi.stubGlobal("fetch", () => {
      throw new Error("something nobody predicted");
    });
    await expect(fetchHealth()).resolves.toMatchObject({ state: "offline" });
  });
});

describe("choosing an adapter", () => {
  it("uses the live adapter in live mode", async () => {
    const seen = stubApi(() => jsonResponse({ data: { status: "ok" } }));

    const client = crydenClient();
    expect(client.mode).toBe("live");
    expect((await client.health()).state).toBe("api-client");
    expect(seen).toHaveLength(1);
  });

  it("uses the fixtures adapter in fixtures mode, and calls nothing", async () => {
    useEnvironment("fixtures");

    // A fetch that fails the test if it happens at all: the point of fixtures
    // mode is that it works with no API anywhere.
    vi.stubGlobal("fetch", () => {
      throw new Error("fixtures mode must not call the API");
    });

    const client = crydenClient();
    expect(client.mode).toBe("fixtures");

    const health = await client.health();
    expect(health.state).toBe("fixtures");
    expect(health.detail).toBe(API_STATUS_DETAILS.fixtures);
  });

  it("cannot report a real connection from fixtures, even when the API is up", async () => {
    useEnvironment("fixtures");
    stubApi(() => jsonResponse({ data: { status: "ok" } }));

    const health = await crydenClient().health();
    // The type makes this unreachable, and it is asserted anyway: this is the
    // sentence an operator would read before trusting a screen.
    expect(health.state).not.toBe("api-client");
    expect(health.state).toBe("fixtures");
  });

  it("cannot report fixtures from a live console", async () => {
    stubApi(() => jsonResponse({ data: { status: "ok" } }));
    expect((await crydenClient().health()).state).not.toBe("fixtures");

    // Not even when the API is unreachable: offline is offline, not sample data.
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    expect((await crydenClient().health()).state).not.toBe("fixtures");
  });

  it("re-reads the mode rather than caching one", () => {
    expect(crydenClient().mode).toBe("live");
    useEnvironment("fixtures");
    expect(crydenClient().mode).toBe("fixtures");
  });
});

describe("the status vocabulary", () => {
  it("has one label and one sentence for each state, and no others", () => {
    expect(Object.keys(API_STATUS_LABELS).sort()).toEqual([...API_STATUSES].sort());
    expect(Object.keys(API_STATUS_DETAILS).sort()).toEqual([...API_STATUSES].sort());

    for (const status of API_STATUSES) {
      expect(API_STATUS_LABELS[status]).not.toBe("");
      // Long enough to be a sentence, so a tag is never the only explanation.
      expect(API_STATUS_DETAILS[status].length).toBeGreaterThan(40);
    }
  });

  it("gives each state its own tag colour", () => {
    const classes = API_STATUSES.map(apiStatusClass);
    expect(new Set(classes).size).toBe(API_STATUSES.length);
  });

  it("says out loud, in the fixtures sentence, that the data is not real", () => {
    expect(API_STATUS_DETAILS.fixtures).toContain("sample data");
    expect(API_STATUS_DETAILS.fixtures).toContain("no action taken here is real");
  });
});

describe("an operator's avatar letter", () => {
  it("takes the first letter of the address", () => {
    expect(initialsFromLabel("ops@example.invalid")).toBe("O");
    expect(initialsFromLabel("Ops@example.invalid")).toBe("O");
  });

  it("skips punctuation rather than showing it", () => {
    expect(initialsFromLabel("_ops@example.invalid")).toBe("O");
    expect(initialsFromLabel("...9@example.invalid")).toBe("9");
  });

  it("falls back rather than guessing when there is no letter", () => {
    expect(initialsFromLabel("")).toBe("?");
    expect(initialsFromLabel("@example.invalid")).toBe("?");
    expect(initialsFromLabel("---")).toBe("?");
  });

  it("handles a label that is not an address", () => {
    expect(initialsFromLabel("operator")).toBe("O");
  });
});
