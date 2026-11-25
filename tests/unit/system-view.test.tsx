// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SystemView } from "@/app/(console)/system/system-view";

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
});

describe("SystemView", () => {
  it("shows aggregate counts, diagnostics, and migration state independently", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            data: {
              stats: {
                state: "ok",
                data: { users: 18, active_sessions: 4, operators: 2, active_api_keys: 3 },
              },
              doctor: {
                state: "ok",
                data: {
                  status: "degraded",
                  checked_at: "2026-11-15T12:00:00Z",
                  checks: [
                    {
                      name: "database",
                      status: "healthy",
                      detail: "The authentication database answered.",
                    },
                    {
                      name: "migrations",
                      status: "attention",
                      detail: "The database migration records do not match this API build.",
                    },
                  ],
                },
              },
              migrations: {
                state: "ok",
                data: {
                  current: "001_initial_schema.up.sql",
                  applied: [
                    { name: "001_initial_schema.up.sql", applied_at: "2026-11-15T11:00:00Z" },
                  ],
                  pending: ["002_users.up.sql"],
                  unknown: [],
                },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    await act(async () => root.render(<SystemView />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(container.textContent).toContain("18");
    expect(container.textContent).toContain("Active sessions");
    expect(container.textContent).toContain("Deployment checks");
    expect(container.textContent).toContain("degraded");
    expect(container.textContent).toContain("002_users.up.sql");
    expect(container.textContent).toContain("Current migration: 001_initial_schema.up.sql");
  });
});
