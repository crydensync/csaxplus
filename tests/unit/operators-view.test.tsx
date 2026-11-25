// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OperatorsView } from "@/app/(console)/operators/operators-view";

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

describe("OperatorsView", () => {
  it("shows the live operator roster and keeps writes hidden from non-owners", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            data: {
              total: 1,
              operators: [
                {
                  user_id: "01a1d782-0635-7e41-bd60-50e1cfef5fc8",
                  email: "owner@example.com",
                  role: "owner",
                  created_at: "2026-11-14T12:00:00Z",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    await act(async () => root.render(<OperatorsView owner={false} csrf="test-csrf" />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(container.textContent).toContain("owner@example.com");
    expect(container.textContent).toContain("owner");
    expect(container.textContent).toContain("1 operators");
    expect(container.textContent).toContain(
      "Access changes, session revocation and passkey removal require a fresh passkey confirmation.",
    );
    expect(
      Array.from(container.querySelectorAll("button")).map((button) => button.textContent),
    ).toEqual(["Refresh"]);
  });
});
