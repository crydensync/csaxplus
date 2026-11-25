import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PUT } from "@/app/api/console/ai-widget/route";
import { ASK_AI_WIDGET_PATH } from "@/server/cryden/admin";
import { SESSION_COOKIE, sealSession, type Session } from "@/server/auth/session";
import { resetConfigCache } from "@/server/config/index";

const TOKEN = "an-admin-token";
const CSRF = "a-csrf-value";
const SESSION_SECRET = Buffer.alloc(32, 1).toString("base64");
const VAULT_KEY = Buffer.alloc(32, 2).toString("base64");
const CONFIG = {
  enabled: true,
  allowed_origins: ["https://app.example.com"],
  entities: ["sessions", "audit_events"],
  greeting: "Ask about your account",
  placeholder: "What would you like to know?",
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
  const seen: { method: string; path: string; body: string | null }[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({
      method: init?.method ?? "GET",
      path: new URL(String(input)).pathname,
      body: typeof init?.body === "string" ? init.body : null,
    });
    return reply();
  });
  return seen;
}

async function request(method: "GET" | "PUT" = "GET", body?: unknown, csrf: string | null = CSRF) {
  const headers = new Headers({ origin: "http://localhost:3000" });
  headers.set("cookie", `${SESSION_COOKIE}=${await sealSession(SESSION)}`);
  if (csrf) headers.set("x-csrf-token", csrf);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request("http://localhost:3000/api/console/ai-widget", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("Ask-AI widget settings route", () => {
  it("reads current settings from CSAG", async () => {
    const seen = stubApi(() => Response.json({ data: CONFIG }));
    const response = await GET(await request());
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(CONFIG);
    expect(seen).toEqual([{ method: "GET", path: ASK_AI_WIDGET_PATH, body: null }]);
  });

  it("requires CSRF and saves validated settings through CSAG", async () => {
    const seen = stubApi(() => Response.json({ data: CONFIG }));
    const missingCsrf = await PUT(await request("PUT", CONFIG, null));
    expect(missingCsrf.status).toBe(403);
    expect(seen).toHaveLength(0);

    const response = await PUT(await request("PUT", CONFIG));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(CONFIG);
    expect(seen).toEqual([
      { method: "PUT", path: ASK_AI_WIDGET_PATH, body: JSON.stringify(CONFIG) },
    ]);
  });
});
