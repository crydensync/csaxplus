// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebhooksView } from "@/app/(console)/webhooks/webhooks-view";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("webhook settings mutations", () => {
  it("sends the session CSRF value with save, test, and clear requests", async () => {
    const mutations: Array<{ method: string; csrf: string | null }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost:3000");
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        mutations.push({ method, csrf: new Headers(init?.headers).get("x-csrf-token") });
      }
      if (url.pathname.endsWith("/endpoints") && method === "GET") {
        return jsonResponse({
          data: {
            endpoints: [
              {
                id: "endpoint-1",
                name: "Test",
                url: "https://hooks.example.test",
                secret_set: true,
              },
            ],
          },
        });
      }
      if (method === "POST" && url.pathname.endsWith("/test")) {
        return jsonResponse({
          data: { queued: true, event_id: "evt-test", destination_id: "endpoint-1" },
        });
      }
      if (method === "GET") {
        return jsonResponse({
          data: {
            state: "ok",
            data: {
              deliveries: [],
              count: 0,
              statuses: ["pending", "in_flight", "delivered", "failed"],
            },
          },
        });
      }
      return jsonResponse({
        data:
          method === "DELETE"
            ? { removed: true }
            : {
                id: "endpoint-1",
                name: "Test",
                url: "https://hooks.example.test",
                secret_set: true,
              },
      });
    });

    await act(async () => {
      root.render(<WebhooksView csrf="the-session-csrf-token" />);
    });
    await settle();
    vi.spyOn(window, "setTimeout").mockReturnValue(
      0 as unknown as ReturnType<typeof window.setTimeout>,
    );

    const sendTest = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Test",
    );
    expect(sendTest).toBeDefined();
    await act(async () => sendTest?.click());

    expect(mutations).toEqual([{ method: "POST", csrf: "the-session-csrf-token" }]);
  });
});
