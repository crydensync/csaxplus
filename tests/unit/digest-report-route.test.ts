import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/console/digest/report/route";
import { DIGEST_REPORT_PATH } from "@/server/cryden/admin";
import { SESSION_COOKIE, sealSession, type Session } from "@/server/auth/session";
import { resetConfigCache } from "@/server/config/index";

const TOKEN = "an-admin-token";
const SESSION_SECRET = Buffer.alloc(32, 1).toString("base64");
const VAULT_KEY = Buffer.alloc(32, 2).toString("base64");
const SESSION: Session = {
  sid: "sid-1",
  apiSessionId: "api-1",
  operator: { id: "operator-1", label: "admin@example.test", role: "admin" },
  api: { accessToken: TOKEN, refreshToken: "refresh-token", expiresAt: Date.now() + 600_000 },
  csrf: "csrf-value",
};

beforeEach(() => {
  process.env.CSAX_API_URL = "http://127.0.0.1:8080";
  process.env.CRYDEN_MODE = "live";
  process.env.CSAX_SESSION_SECRET = SESSION_SECRET;
  process.env.CSAX_VAULT_KEY = VAULT_KEY;
  process.env.WEBAUTHN_ORIGIN = "http://localhost:3000";
  resetConfigCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function request(path: string) {
  return sealSession(SESSION).then(
    (sealed) =>
      new Request(`http://localhost:3000${path}`, {
        headers: { origin: "http://localhost:3000", cookie: `${SESSION_COOKIE}=${sealed}` },
      }),
  );
}

describe("on-demand digest report route", () => {
  it("uses the authenticated admin token and selected window", async () => {
    const seen: { path: string; authorization: string | null }[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      seen.push({
        path: `${url.pathname}${url.search}`,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return Response.json({
        data: {
          since: "2026-11-10T12:00:00Z",
          until: "2026-11-17T12:00:00Z",
          window_days: 7,
          text: "Weekly security report",
        },
      });
    });

    const response = await GET(await request("/api/console/digest/report?window_days=7"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.text).toBe("Weekly security report");
    expect(seen).toEqual([
      { path: `${DIGEST_REPORT_PATH}?window_days=7`, authorization: `Bearer ${TOKEN}` },
    ]);
  });

  it("rejects invalid windows before calling CSAG", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await GET(await request("/api/console/digest/report?window_days=0"));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
