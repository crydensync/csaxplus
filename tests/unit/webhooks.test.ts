import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DELETE as CLEAR_ENDPOINT,
  GET,
  POST as QUEUE_TEST,
  PUT as SAVE_ENDPOINT,
} from "@/app/api/console/webhooks/route";
import { SESSION_COOKIE, sealSession, type Session } from "@/server/auth/session";
import {
  clearWebhookEndpoint,
  createWebhookEndpoint,
  fetchWebhookEndpoints,
  fetchWebhookEndpoint,
  fetchWebhookDeliveries,
  queueWebhookDestinationTest,
  removeWebhookEndpoint,
  queueWebhookTest,
  saveWebhookEndpoint,
  updateWebhookEndpoint,
} from "@/server/cryden/admin";
import { resetConfigCache } from "@/server/config/index";

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
  search?: string;
  authorization: string | null;
  body: unknown;
};

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

const SESSION: Session = {
  sid: "sid-1",
  apiSessionId: "api-1",
  operator: { id: "op-1", label: "op@example.invalid", role: "admin" },
  api: { accessToken: TOKEN, refreshToken: "refresh", expiresAt: Date.now() + 600_000 },
  csrf: "the-csrf-value",
};

async function request(
  method: string,
  options: {
    session?: Session | null;
    body?: unknown;
    csrf?: string | null;
    origin?: string;
  } = {},
): Promise<Request> {
  const session = options.session === undefined ? SESSION : options.session;
  const headers = new Headers({ origin: options.origin ?? "http://localhost:3000" });
  if (session !== null) headers.set("cookie", `${SESSION_COOKIE}=${await sealSession(session)}`);
  const csrf = options.csrf === undefined ? session?.csrf : options.csrf;
  if (csrf !== null && csrf !== undefined) headers.set("x-csrf-token", csrf);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return new Request("http://localhost:3000/api/console/webhooks", {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

describe("webhook calls against CSAG", () => {
  it("creates, lists, edits, tests, removes, and filters destinations using the admin contract", async () => {
    const calls: Seen[] = [];
    const replies = [
      {
        data: {
          id: "0123456789abcdef0123456789abcdef",
          name: "Billing",
          url: "https://billing.example/hook",
          secret_set: true,
        },
      },
      {
        data: {
          endpoints: [
            {
              id: "0123456789abcdef0123456789abcdef",
              name: "Billing",
              url: "https://billing.example/hook",
              secret_set: true,
            },
          ],
        },
      },
      {
        data: {
          id: "0123456789abcdef0123456789abcdef",
          name: "Billing v2",
          url: "https://billing.example/v2",
          secret_set: true,
        },
      },
      {
        data: {
          queued: true,
          event_id: "evt-test",
          destination_id: "0123456789abcdef0123456789abcdef",
        },
      },
      {
        data: {
          deliveries: [],
          count: 0,
          statuses: ["pending", "in_flight", "delivered", "failed"],
        },
      },
      { data: { removed: true } },
    ];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({
        path: url.pathname,
        search: url.search,
        method: init?.method ?? "GET",
        authorization: new Headers(init?.headers).get("authorization"),
        body: init?.body,
      });
      return jsonResponse(replies.shift());
    });
    const id = "0123456789abcdef0123456789abcdef";
    await createWebhookEndpoint({
      token: TOKEN,
      name: "Billing",
      url: "https://billing.example/hook",
      secret: "secret",
    });
    await fetchWebhookEndpoints({ token: TOKEN });
    await updateWebhookEndpoint({
      token: TOKEN,
      id,
      name: "Billing v2",
      url: "https://billing.example/v2",
    });
    await queueWebhookDestinationTest({ token: TOKEN, id });
    await fetchWebhookDeliveries({ token: TOKEN, destinationID: id });
    await removeWebhookEndpoint({ token: TOKEN, id });
    expect(calls.map(({ method, path }) => [method, path])).toEqual([
      ["POST", "/v1/admin/webhooks/endpoints"],
      ["GET", "/v1/admin/webhooks/endpoints"],
      ["PUT", `/v1/admin/webhooks/endpoints/${id}`],
      ["POST", `/v1/admin/webhooks/endpoints/${id}/test`],
      ["GET", "/v1/admin/webhooks/deliveries"],
      ["DELETE", `/v1/admin/webhooks/endpoints/${id}`],
    ]);
    expect(calls[4]?.search).toContain(`destination_id=${id}`);
    expect(calls.every((call) => call.authorization === `Bearer ${TOKEN}`)).toBe(true);
  });

  it("reads only the endpoint URL and secret presence", async () => {
    const seen = stubApi(() =>
      jsonResponse({ data: { url: "https://hooks.example.test", secret_set: true } }),
    );

    await expect(fetchWebhookEndpoint({ token: TOKEN })).resolves.toEqual({
      url: "https://hooks.example.test",
      secret_set: true,
    });
    expect(seen[0]).toMatchObject({
      method: "GET",
      path: "/v1/admin/webhooks",
      authorization: `Bearer ${TOKEN}`,
    });
  });

  it("saves the destination and optional secret through the existing PUT contract", async () => {
    const seen = stubApi(() =>
      jsonResponse({ data: { url: "https://hooks.example.test", secret_set: true } }),
    );

    await saveWebhookEndpoint({
      token: TOKEN,
      url: "https://hooks.example.test",
      secret: "new-secret",
    });

    expect(seen[0]).toMatchObject({
      method: "PUT",
      path: "/v1/admin/webhooks",
      authorization: `Bearer ${TOKEN}`,
      body: { url: "https://hooks.example.test", secret: "new-secret" },
    });
  });

  it("clears runtime settings and queues a test against the existing routes", async () => {
    const seen: Seen[] = [];
    let call = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      seen.push({
        method: init?.method ?? "GET",
        path: url.pathname,
        authorization: new Headers(init?.headers).get("authorization"),
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      call += 1;
      return call === 1
        ? jsonResponse({ data: { url: "", secret_set: false } })
        : jsonResponse({ data: { queued: true, event_id: "evt-test" } }, 202);
    });

    await expect(clearWebhookEndpoint({ token: TOKEN })).resolves.toEqual({
      url: "",
      secret_set: false,
    });
    await expect(queueWebhookTest({ token: TOKEN })).resolves.toEqual({
      queued: true,
      event_id: "evt-test",
    });

    expect(seen.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "DELETE", path: "/v1/admin/webhooks" },
      { method: "POST", path: "/v1/admin/webhooks/test" },
    ]);
  });
});

describe("webhook console routes", () => {
  it("relays endpoint updates using the session token after mutation checks", async () => {
    const seen = stubApi(() =>
      jsonResponse({ data: { url: "https://hooks.example.test", secret_set: true } }),
    );
    const response = await SAVE_ENDPOINT(
      await request("PUT", { body: { url: "https://hooks.example.test", secret: "new-secret" } }),
    );

    expect(response.status).toBe(200);
    expect(seen[0]).toMatchObject({
      method: "PUT",
      path: "/v1/admin/webhooks",
      authorization: `Bearer ${TOKEN}`,
      body: { url: "https://hooks.example.test", secret: "new-secret" },
    });
  });

  it("relays clear and test actions through the session token", async () => {
    const seen = stubApi(() =>
      jsonResponse({ data: { url: "", secret_set: false, queued: true, event_id: "evt-test" } }),
    );

    const clearResponse = await CLEAR_ENDPOINT(await request("DELETE"));
    const testResponse = await QUEUE_TEST(await request("POST"));

    expect(clearResponse.status).toBe(200);
    expect(testResponse.status).toBe(200);
    expect(
      seen.map(({ method, path, authorization }) => ({ method, path, authorization })),
    ).toEqual([
      { method: "DELETE", path: "/v1/admin/webhooks", authorization: `Bearer ${TOKEN}` },
      { method: "POST", path: "/v1/admin/webhooks/test", authorization: `Bearer ${TOKEN}` },
    ]);
  });

  it.each([
    ["PUT", SAVE_ENDPOINT, { url: "https://hooks.example.test", secret: "new-secret" }],
    ["DELETE", CLEAR_ENDPOINT, undefined],
    ["POST", QUEUE_TEST, undefined],
  ] as const)(
    "rejects %s without the CSRF token before calling CSAG",
    async (method, handler, body) => {
      const seen = stubApi(() => jsonResponse({ data: {} }));
      const response = await handler(await request(method, { body, csrf: null }));

      expect(response.status).toBe(403);
      expect(seen).toEqual([]);
    },
  );

  it("rejects cross-origin mutation requests before calling CSAG", async () => {
    const seen = stubApi(() => jsonResponse({ data: {} }));
    const response = await QUEUE_TEST(
      await request("POST", { origin: "https://attacker.example.test" }),
    );

    expect(response.status).toBe(403);
    expect(seen).toEqual([]);
  });

  it("does not let viewer sessions change the endpoint or queue test deliveries", async () => {
    const seen = stubApi(() => jsonResponse({ data: {} }));
    const viewer: Session = {
      ...SESSION,
      operator: { ...SESSION.operator, role: "viewer" },
    };
    const response = await SAVE_ENDPOINT(
      await request("PUT", { session: viewer, body: { url: "https://hooks.example.test" } }),
    );

    expect(response.status).toBe(403);
    expect(seen).toEqual([]);
  });

  it("rejects an unknown history status without calling CSAG", async () => {
    const seen = stubApi(() => jsonResponse({ data: {} }));
    const response = await GET(
      new Request("http://localhost:3000/api/console/webhooks?status=unknown", {
        headers: {
          origin: "http://localhost:3000",
          cookie: `${SESSION_COOKIE}=${await sealSession(SESSION)}`,
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(seen).toEqual([]);
  });
});
