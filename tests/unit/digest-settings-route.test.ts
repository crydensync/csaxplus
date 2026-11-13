import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PUT } from "@/app/api/console/digest/settings/route";
import { DIGEST_SETTINGS_PATH } from "@/server/cryden/admin";
import { SESSION_COOKIE, sealSession, type Session } from "@/server/auth/session";
import { resetConfigCache } from "@/server/config/index";

const TOKEN = "an-admin-token";
const CSRF = "a-csrf-value";
const SESSION_SECRET = Buffer.alloc(32, 1).toString("base64");
const VAULT_KEY = Buffer.alloc(32, 2).toString("base64");
const SCHEDULE = {
  enabled: true,
  day_of_week: "friday",
  time: "16:30",
  timezone: "Africa/Casablanca",
  recipients: ["security@example.com"],
  delivery_enabled: false,
  delivery_available: false,
};

const SESSION: Session = {
  sid: "sid-1",
  apiSessionId: "api-1",
  operator: { id: "operator-1", label: "admin@example.test", role: "admin" },
  api: { accessToken: TOKEN, refreshToken: "refresh-token", expiresAt: Date.now() + 600_000 },
  csrf: CSRF,
};

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

function stubApi(reply: () => Response) {
  const seen: {
    method: string;
    path: string;
    authorization: string | null;
    body: string | null;
  }[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      authorization: new Headers(init?.headers).get("authorization"),
      body: typeof init?.body === "string" ? init.body : null,
    });
    return reply();
  });
  return seen;
}

async function request(
  path: string,
  options: { session?: Session | null; method?: string; csrf?: string | null; body?: unknown } = {},
) {
  const session = options.session === undefined ? SESSION : options.session;
  const headers = new Headers({ origin: "http://localhost:3000" });
  if (session) headers.set("cookie", `${SESSION_COOKIE}=${await sealSession(session)}`);
  const csrf = options.csrf === undefined ? session?.csrf : options.csrf;
  if (csrf) headers.set("x-csrf-token", csrf);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

describe("digest schedule BFF routes", () => {
  it("reads the schedule with the authenticated admin token", async () => {
    const seen = stubApi(() => Response.json({ data: SCHEDULE }));
    const response = await GET(await request("/api/console/digest/settings"));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(SCHEDULE);
    expect(seen).toEqual([
      { method: "GET", path: DIGEST_SETTINGS_PATH, authorization: `Bearer ${TOKEN}`, body: null },
    ]);
  });

  it("requires CSRF and relays only validated digest settings", async () => {
    const input = {
      enabled: true,
      day_of_week: "friday",
      time: "16:30",
      timezone: "Africa/Casablanca",
      recipients: ["security@example.com"],
      delivery_enabled: false,
    };
    const seen = stubApi(() => Response.json({ data: SCHEDULE }));
    const noCSRF = await PUT(
      await request("/api/console/digest/settings", { method: "PUT", csrf: null, body: input }),
    );
    expect(noCSRF.status).toBe(403);
    expect(seen).toHaveLength(0);

    const response = await PUT(
      await request("/api/console/digest/settings", { method: "PUT", body: input }),
    );
    expect(response.status).toBe(200);
    expect(seen[0]).toEqual({
      method: "PUT",
      path: DIGEST_SETTINGS_PATH,
      authorization: `Bearer ${TOKEN}`,
      body: JSON.stringify(input),
    });
  });

  it("refuses viewers and malformed settings before calling CSAG", async () => {
    const seen = stubApi(() => Response.json({ data: SCHEDULE }));
    const viewer: Session = { ...SESSION, operator: { ...SESSION.operator, role: "viewer" } };
    const forbidden = await PUT(
      await request("/api/console/digest/settings", {
        session: viewer,
        method: "PUT",
        body: SCHEDULE,
      }),
    );
    expect(forbidden.status).toBe(403);

    const invalid = await PUT(
      await request("/api/console/digest/settings", {
        method: "PUT",
        body: { ...SCHEDULE, time: "99:99" },
      }),
    );
    expect(invalid.status).toBe(400);
    expect(seen).toHaveLength(0);
  });
});
