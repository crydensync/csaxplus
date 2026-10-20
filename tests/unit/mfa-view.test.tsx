// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MfaView } from "@/app/(console)/mfa/mfa-view";
import { SQLITE_ADMIN_DETAIL } from "@/lib/dashboard";
import { MFA_ADOPTION_NOTE, MFA_FORCE_DISABLE_NOTE } from "@/lib/mfa";

/**
 * What the MFA & Passkeys screen puts on the screen, for each state it can be
 * in.
 *
 * The states cannot be reached in a browser from a test: every one of them
 * needs a signed-in operator against a real API. So the rendering is checked
 * here, with the console's own route stubbed, and the sign-in journey stays
 * covered by the end-to-end suite. This is a real render, and the assertions
 * are against the text an operator would read.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADOPTION_ROUTE = "/api/console/mfa/adoption";

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
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Answers the console's route, and records what was asked for.
 *
 * A throwing handler is the stand-in for the fetch that never left: the stub
 * throws, the screen's catch runs, and the unreachable state is what renders.
 */
function stubRoutes(routes: Record<string, () => Response | Promise<Response>>): string[] {
  const seen: string[] = [];

  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost:3000");
    seen.push(`GET ${url.pathname}${url.search}`);
    const handler = routes[url.pathname];
    if (handler === undefined) throw new Error(`no stub for GET ${url.pathname}`);
    return handler();
  });

  return seen;
}

/** A section that answered, as the console's own route passes it through. */
function ok(data: unknown) {
  return { state: "ok", data };
}

function factor(
  name: string,
  over: Partial<{
    enrolled_events: number;
    removed_events: number;
    enrolled_events_in_window: number;
    removed_events_in_window: number;
  }> = {},
) {
  return {
    factor: name,
    enrolled_events: 1017,
    removed_events: 203,
    enrolled_events_in_window: 41,
    removed_events_in_window: 6,
    ...over,
  };
}

const A_REPORT = {
  total_users: 2481,
  window_days: 30,
  factors: [factor("totp"), factor("passkey", { enrolled_events: 203, removed_events: 12 })],
};

/** Renders the screen against a route handler, defaulting to a good report. */
async function renderMfa(
  handler: () => Response | Promise<Response> = () => jsonResponse({ data: ok(A_REPORT) }),
) {
  const seen = stubRoutes({ [ADOPTION_ROUTE]: handler });

  await act(async () => {
    root.render(<MfaView />);
  });

  return seen;
}

/**
 * The words on the screen.
 *
 * Read from the body rather than the container the render was mounted into,
 * because overlays render into the document body through the portal.
 */
function text(): string {
  return document.body.textContent ?? "";
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("while the report is being read", () => {
  it("shows a loading announcement and claims nothing", async () => {
    // A route that never answers, so the loading state is the one on screen.
    await renderMfa(() => new Promise<Response>(() => undefined));

    expect(text()).toContain("Loading the second-factor report");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

describe("when the report arrives", () => {
  it("renders both factors' event counts, all-time and in the window", async () => {
    await renderMfa();

    expect(text()).toContain("Authenticator apps");
    expect(text()).toContain("1,017");
    expect(text()).toContain("41 enrolled and 6 removed in the last 30 days");
    expect(text()).toContain("Passkeys");
    expect(text()).toContain("203");
  });

  it("names the account total, and no share of users is derived", async () => {
    await renderMfa();

    expect(text()).toContain("2,481");
    expect(text()).toContain("every account the API counts");
    // The percentage question is answered by the sentence that says why there
    // is not one, which is shared with the dashboard's read of the report.
    expect(text()).toContain(MFA_ADOPTION_NOTE);
  });

  it("quotes the window from the answer, not from a default of its own", async () => {
    await renderMfa(() =>
      jsonResponse({
        data: ok({
          total_users: 10,
          window_days: 7,
          factors: [factor("totp", { enrolled_events: 3, enrolled_events_in_window: 2 })],
        }),
      }),
    );

    expect(text()).toContain("in the last 7 days");
  });

  it("words a factor the report does not cover as not reported", async () => {
    await renderMfa(() =>
      jsonResponse({
        data: ok({
          total_users: 1,
          window_days: 30,
          factors: [factor("totp", { removed_events: 0 })],
        }),
      }),
    );

    expect(text()).toContain("Not reported");
    expect(text()).toContain("The API's report does not cover this factor.");
  });

  it("points at the Users screen for removing an account's second factor", async () => {
    await renderMfa();

    expect(text()).toContain(MFA_FORCE_DISABLE_NOTE);
  });
});

describe("when the API answers without the report", () => {
  it("renders a SQLite deployment's refusal as the deployment's shape", async () => {
    // The section travels inside the envelope's data, so this is the route
    // answering 200 with a section that is not ok, the way the console's own
    // routes hand a failed read to the browser.
    await renderMfa(() =>
      jsonResponse({
        data: {
          state: "unavailable",
          detail: SQLITE_ADMIN_DETAIL,
          code: "not_implemented_on_sqlite",
        },
      }),
    );

    expect(text()).toContain(SQLITE_ADMIN_DETAIL);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("renders a refusal of the account as a refusal, not a fault", async () => {
    await renderMfa(() =>
      jsonResponse({
        data: {
          state: "forbidden",
          detail: "The API does not recognise this account as a console operator.",
          code: "not_operator",
        },
      }),
    );

    expect(text()).toContain("Refused by the API");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("announces a real fault with the section's sentence and offers the read again", async () => {
    await renderMfa(() =>
      jsonResponse({
        data: { state: "error", detail: "the store is down", code: "db_unreachable" },
      }),
    );

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("the store is down");
    expect(text()).toContain("Try again");
  });

  it("words a refusal from the console's own guard as the failure it is", async () => {
    // A session that expired between the page render and this read: the route
    // answers 401 with an envelope, and the failure path is what renders.
    await renderMfa(() =>
      jsonResponse({ error: { code: "unauthenticated", message: "Sign in again." } }, 401),
    );

    expect(text()).toContain("Sign in again");
    expect(text()).toContain("Try again");
  });
});

describe("when the console route itself fails", () => {
  it("words an unreachable console as the read that did not happen", async () => {
    await renderMfa(() => {
      throw new TypeError("failed to fetch");
    });
    await settle();

    expect(text()).toContain("The console could not reach its own server");
  });

  it("words an answer without a data envelope as a shape the screen does not recognise", async () => {
    await renderMfa(() => jsonResponse({ nope: true }));

    expect(text()).toContain("shape this screen does not recognise");
  });
});
