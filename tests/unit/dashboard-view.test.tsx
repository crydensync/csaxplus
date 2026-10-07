// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardOverview } from "@/app/(console)/dashboard/overview";
import {
  DIGEST_NONE_STORED_DETAIL,
  DIGEST_NOT_SCHEDULED_DETAIL,
  NOT_OPERATOR_DETAIL,
  SQLITE_ADMIN_DETAIL,
} from "@/lib/dashboard";

/**
 * What the dashboard puts on the screen, for each state it can be in.
 *
 * The four data states cannot be reached in a browser yet: every one of them
 * needs a signed-in operator, and a session needs a real sign-in against a real
 * API. So the rendering is checked here instead, with the console's own route
 * stubbed, and the sign-in journey stays covered by the end-to-end suite.
 *
 * This is a real render rather than a shallow one: the component, its children
 * and their effects all run, and the assertions are against the text an operator
 * would read.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DASHBOARD_ROUTE = "/api/console/dashboard";

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

/** Answers the console's own route with `reply`, and renders the dashboard. */
async function renderDashboard(reply: () => Response | Promise<Response>) {
  const seen: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost:3000");
    seen.push(url.pathname + url.search);
    return reply();
  });

  await act(async () => {
    root.render(<DashboardOverview />);
  });

  return seen;
}

const OK = {
  accounts: {
    state: "ok",
    data: {
      total: 1234,
      newest: [
        {
          id: "01J0000000000000000000000B",
          email: "newest@example.invalid",
          created_at: "2026-10-04T09:00:00Z",
          updated_at: "2026-10-04T09:00:00Z",
          failed_attempts: 0,
          locked: false,
          locked_until: null,
        },
        {
          id: "01J0000000000000000000000A",
          email: "locked@example.invalid",
          created_at: "2026-09-01T09:00:00Z",
          updated_at: "2026-10-01T09:00:00Z",
          failed_attempts: 4,
          locked: true,
          locked_until: "2026-10-05T09:15:00Z",
        },
      ],
    },
  },
  factors: {
    state: "ok",
    data: {
      total_users: 1234,
      window_days: 7,
      factors: [
        {
          factor: "totp",
          enrolled_events: 310,
          removed_events: 12,
          enrolled_events_in_window: 8,
          removed_events_in_window: 2,
        },
        {
          factor: "passkey",
          enrolled_events: 96,
          removed_events: 1,
          enrolled_events_in_window: 3,
          removed_events_in_window: 0,
        },
      ],
    },
  },
  hashes: {
    state: "ok",
    data: {
      hasher: { algorithm: "argon2id" },
      total_users: 1234,
      upgraded_events: 1200,
      estimated_remaining: 34,
      window_days: 7,
      upgraded_events_in_window: 40,
    },
  },
  digest: {
    state: "ok",
    data: {
      id: 9,
      window_start: "2026-09-28T00:00:00Z",
      window_end: "2026-10-05T00:00:00Z",
      generated_at: "2026-10-05T00:00:03Z",
      text: "Security digest\n\nNothing needs attention.\n",
    },
  },
};

function text(): string {
  return container.textContent ?? "";
}

describe("while the reports are being read", () => {
  it("shows the shape of the screen and claims nothing in it", async () => {
    // A route that never answers, so the loading state is the one on screen.
    await renderDashboard(() => new Promise<Response>(() => undefined));

    // Every tile is present and empty, so the operator sees what is coming
    // rather than a spinner that could resolve into anything.
    for (const label of ["Total users", "Authenticator apps", "Passkeys", "Password hashes"]) {
      expect(text()).toContain(label);
    }
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    // Announced once, politely, rather than a wall of meaningless boxes.
    expect(text()).toContain("Loading the dashboard reports");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

describe("when the reports arrive", () => {
  it("shows every number the API sent", async () => {
    const seen = await renderDashboard(() => jsonResponse({ data: OK }));

    expect(seen).toEqual([DASHBOARD_ROUTE]);
    expect(text()).toContain("1,234");
    expect(text()).toContain("310");
    expect(text()).toContain("96");
    expect(text()).toContain("argon2id");
    expect(text()).toContain("34 of 1,234 accounts not recorded as upgraded");
  });

  it("says which window the second-factor numbers cover", async () => {
    await renderDashboard(() => jsonResponse({ data: OK }));

    // Both directions of the change, because a factor whose removals keep pace
    // with its enrolments is churning and neither number says that alone.
    expect(text()).toContain("8 enrolled and 2 removed in the last 7 days");
    expect(text()).toContain("3 enrolled and 0 removed in the last 7 days");
  });

  it("lists the newest accounts with their created time and lock state", async () => {
    await renderDashboard(() => jsonResponse({ data: OK }));

    expect(text()).toContain("newest@example.invalid");
    expect(text()).toContain("4 Oct 2026, 09:00 UTC");
    expect(text()).toContain("locked@example.invalid");
    expect(text()).toContain("active");
    expect(text()).toContain("locked");
  });

  it("prints the digest as text, never as markup", async () => {
    await renderDashboard(() =>
      jsonResponse({
        data: { ...OK, digest: { state: "ok", data: { ...OK.digest.data, text: "<b>hi</b>\n" } } },
      }),
    );

    const digest = container.querySelector(".digest-text");
    expect(digest?.tagName).toBe("PRE");
    // The API's prose, passed through: an angle bracket in it is a character,
    // not an instruction to the browser.
    expect(digest?.textContent).toBe("<b>hi</b>\n");
    expect(digest?.querySelector("b")).toBeNull();
  });

  it("shows the digest's own generation time beside it", async () => {
    await renderDashboard(() => jsonResponse({ data: OK }));
    expect(text()).toContain("generated 5 Oct 2026, 00:00 UTC");
  });
});

describe("when one report fails", () => {
  it("keeps the other three on the screen", async () => {
    await renderDashboard(() =>
      jsonResponse({
        data: {
          ...OK,
          hashes: { state: "error", detail: "hasher unavailable", code: "internal_error" },
        },
      }),
    );

    // The failure is announced with its code so it can be matched to a log.
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("hasher unavailable");
    expect(alert?.textContent).toContain("internal_error");

    // And the three that answered are still readable.
    expect(text()).toContain("1,234");
    expect(text()).toContain("310");
    expect(text()).toContain("Nothing needs attention.");
  });

  it("offers a retry that asks the route again", async () => {
    let calls = 0;
    await renderDashboard(() => {
      calls += 1;
      return jsonResponse({
        data: {
          ...OK,
          hashes:
            calls === 1
              ? { state: "error", detail: "hasher unavailable", code: "internal_error" }
              : OK.hashes,
        },
      });
    });

    const retry = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    expect(retry).toBeDefined();

    await act(async () => {
      retry?.click();
    });

    expect(calls).toBe(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(text()).toContain("argon2id");
  });
});

describe("when the console's own route fails", () => {
  it("says so on the whole screen, with the console's code", async () => {
    await renderDashboard(() =>
      jsonResponse({ error: { code: "unauthenticated", message: "no session" } }, 401),
    );

    expect(text()).toContain("The dashboard did not load");
    expect(text()).toContain("no session");
    expect(text()).toContain("unauthenticated");
  });

  it("does not render a half-filled screen when the answer is unreadable", async () => {
    await renderDashboard(() => jsonResponse({ nothing: "useful" }));

    expect(text()).toContain("The dashboard did not load");
    expect(text()).toContain("console_malformed");
    // Nothing was invented to fill the gap.
    expect(text()).not.toContain("Total users");
  });

  it("reports a route it could not reach rather than staying on the skeleton", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await act(async () => {
      root.render(<DashboardOverview />);
    });

    expect(text()).toContain("The dashboard did not load");
    expect(text()).toContain("console_unreachable");
  });
});

describe("when the whole deployment refuses", () => {
  it("says the admin surface is missing, once, when every report says SQLite", async () => {
    const unavailable = {
      state: "unavailable",
      detail: SQLITE_ADMIN_DETAIL,
      code: "not_implemented_on_sqlite",
    };
    await renderDashboard(() =>
      jsonResponse({
        data: {
          accounts: unavailable,
          factors: unavailable,
          hashes: unavailable,
          digest: unavailable,
        },
      }),
    );

    expect(text()).toContain("This deployment has no admin surface");
    expect(text()).toContain("Postgres");
    // One sentence instead of four, and no retry: trying again cannot add a
    // store to a deployment.
    expect(container.querySelectorAll(".state-block").length).toBe(1);
  });

  it("says the account is not an operator when every report is refused", async () => {
    const forbidden = { state: "forbidden", detail: NOT_OPERATOR_DETAIL, code: "not_operator" };
    await renderDashboard(() =>
      jsonResponse({
        data: { accounts: forbidden, factors: forbidden, hashes: forbidden, digest: forbidden },
      }),
    );

    expect(text()).toContain("This account is not a console operator");
    expect(text()).toContain("operator grant on the API's side");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("does not collapse the screen when only one report is refused", async () => {
    await renderDashboard(() =>
      jsonResponse({
        data: {
          ...OK,
          factors: { state: "forbidden", detail: NOT_OPERATOR_DETAIL, code: "not_operator" },
        },
      }),
    );

    // A section-level refusal is not a deployment-wide one, so the other three
    // reports stay where they are.
    expect(text()).toContain("Refused by the API");
    expect(text()).not.toContain("This account is not a console operator");
    expect(text()).toContain("argon2id");
  });
});

describe("when every report fails the same way", () => {
  it("says it once and offers a retry, rather than one alert per card", async () => {
    // An API that is not listening fails all four reads with the same
    // sentence. Six identical panels is one fact shouted six times.
    const failed = { state: "error", detail: "The API could not be reached.", code: "unreachable" };
    const seen = await renderDashboard(() =>
      jsonResponse({
        data: { accounts: failed, factors: failed, hashes: failed, digest: failed },
      }),
    );

    expect(seen).toEqual([DASHBOARD_ROUTE]);
    expect(text()).toContain("The dashboard's reports did not load");
    expect(text()).toContain("The API could not be reached.");
    expect(container.querySelectorAll(".state-block").length).toBe(1);
    // It is a fault, so it is announced, and the retry is the same one every
    // section would have offered.
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".state-block button")?.click();
    });
    expect(seen.length).toBe(2);
  });

  it("keeps each failure separate when they are not the same failure", async () => {
    // Four different reasons are four different things to fix, so folding them
    // into one sentence would hide three of them.
    await renderDashboard(() =>
      jsonResponse({
        data: {
          accounts: { state: "error", detail: "the accounts read timed out", code: "timeout" },
          factors: { state: "error", detail: "the factors read timed out", code: "timeout" },
          hashes: { state: "error", detail: "the hashes read failed", code: "internal_error" },
          digest: { state: "error", detail: "the digest read failed", code: "internal_error" },
        },
      }),
    );

    expect(text()).not.toContain("The dashboard's reports did not load");
    // Each reason stays in the region it belongs to rather than being folded
    // into one sentence.
    expect(container.querySelectorAll('[role="alert"]').length).toBeGreaterThan(1);
    expect(text()).toContain("the accounts read timed out");
    expect(text()).toContain("the factors read timed out");
    expect(text()).toContain("the hashes read failed");
    expect(text()).toContain("the digest read failed");
  });
});

describe("the digest's empty states", () => {
  it("says no schedule is configured, and how to configure one", async () => {
    await renderDashboard(() =>
      jsonResponse({
        data: { ...OK, digest: { state: "empty", detail: DIGEST_NOT_SCHEDULED_DETAIL } },
      }),
    );

    expect(text()).toContain("Nothing to report");
    expect(text()).toContain("DIGEST_INTERVAL_HOURS");
  });

  it("says a schedule exists and has not run yet, which needs a different fix", async () => {
    await renderDashboard(() =>
      jsonResponse({
        data: { ...OK, digest: { state: "empty", detail: DIGEST_NONE_STORED_DETAIL } },
      }),
    );

    expect(text()).toContain("has not stored a run yet");
    expect(text()).not.toContain("DIGEST_INTERVAL_HOURS");
  });

  it("says there are no accounts yet rather than showing an empty table", async () => {
    await renderDashboard(() =>
      jsonResponse({
        data: {
          ...OK,
          accounts: { state: "ok", data: { total: 0, newest: [] } },
        },
      }),
    );

    expect(text()).toContain("No accounts yet");
    expect(container.querySelector("table")).toBeNull();
  });
});
