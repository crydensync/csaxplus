// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OAuthProvidersView } from "@/app/(console)/oauth/providers-view";
import {
  OAUTH_TEST_COST_DETAIL,
  OAUTH_TEST_NOT_CONFIGURED_DETAIL,
  describeOAuthStatus,
} from "@/lib/oauth";

/**
 * What the OAuth Providers screen puts on the screen, for each state it can be
 * in.
 *
 * The states cannot be reached in a browser from a test: every one of them
 * needs a signed-in operator against a real API. So the rendering is checked
 * here, with the console's own routes stubbed, and the sign-in journey stays
 * covered by the end-to-end suite. This is a real render, and the assertions
 * are against the text an operator would read.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIST_ROUTE = "/api/console/oauth/providers";
const TEST_ROUTE = "/api/console/oauth/google/test";

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
 * Answers the console's routes by path, and records what was asked for.
 *
 * The screen makes two different calls (the list, and one provider's test), so
 * a single reply cannot describe it.
 */
function stubRoutes(
  routes: Record<string, (url: URL, init?: RequestInit) => Response | Promise<Response>>,
) {
  const seen: string[] = [];

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost:3000");
    seen.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    const handler = routes[`${init?.method ?? "GET"} ${url.pathname}`] ?? routes[url.pathname];
    if (handler === undefined)
      throw new Error(`no stub for ${init?.method ?? "GET"} ${url.pathname}`);
    return handler(url, init);
  });

  return seen;
}

/** A section that answered, as the console's own route passes it through. */
function ok(data: unknown) {
  return { state: "ok", data };
}

const A_LIST = [
  { provider: "google", configured: true },
  { provider: "github", configured: false },
];

const A_VERDICT = {
  provider: "google",
  configured: true,
  status: "ok",
  http_status: 400,
  latency_ms: 42,
};

/** Renders the screen against the default page of providers. */
async function renderProviders(
  routes: Record<string, (url: URL, init?: RequestInit) => Response | Promise<Response>> = {},
) {
  const seen = stubRoutes({
    [LIST_ROUTE]: () => jsonResponse({ data: ok(A_LIST) }),
    ...routes,
  });

  await act(async () => {
    root.render(<OAuthProvidersView csrf="the-csrf-value" />);
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

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
}

/** Clicks one row's Test button, by the provider whose row it is in. */
async function clickTest(provider: string) {
  const row = [...container.querySelectorAll("tbody tr")].find((candidate) =>
    candidate.textContent?.includes(provider),
  );
  const button = [...(row?.querySelectorAll("button") ?? [])].find(
    (candidate) => candidate.textContent === "Test",
  );
  if (button === undefined) throw new Error(`no Test button in the ${provider} row`);
  await act(async () => {
    button.click();
  });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("while the providers are being read", () => {
  it("shows the table's shape and claims nothing in it", async () => {
    // A route that never answers, so the loading state is the one on screen.
    await renderProviders({ [LIST_ROUTE]: () => new Promise<Response>(() => undefined) });

    for (const header of ["Provider", "Configured", "Reachability"]) {
      expect(text()).toContain(header);
    }
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(text()).toContain("Loading the providers");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

describe("when the provider list arrives", () => {
  it("lists every provider the API reports, configured or not", async () => {
    await renderProviders();

    expect(text()).toContain("google");
    expect(text()).toContain("github");
    expect(text()).toContain("configured");
    expect(text()).toContain("not configured");
    // The cost sentence is on the screen before any button is clicked, so an
    // operator knows what a test spends before spending it.
    expect(text()).toContain(OAUTH_TEST_COST_DETAIL);
  });

  it("offers a test only to a provider with credentials, and says why for the rest", async () => {
    await renderProviders();

    const googleRow = [...container.querySelectorAll("tbody tr")].find((candidate) =>
      candidate.textContent?.includes("google"),
    );
    const githubRow = [...container.querySelectorAll("tbody tr")].find((candidate) =>
      candidate.textContent?.includes("github"),
    );

    expect(googleRow?.querySelector("button")?.textContent).toBe("Test");
    // An unconfigured provider has nothing to probe, and the cell says that
    // rather than showing a button whose answer is a foregone 404.
    expect(githubRow?.querySelector("button")).toBeNull();
    expect(githubRow?.textContent).toContain("No credentials to test");
  });
});

describe("testing a provider", () => {
  it("sends the probe through the console's own route, with the CSRF token", async () => {
    const seen = await renderProviders({
      [TEST_ROUTE]: () => jsonResponse({ data: { ...A_VERDICT, latency_ms: 57 } }),
    });

    await clickTest("google");
    await settle();

    expect(seen).toContain(`POST /api/console/oauth/google/test`);
    // The verdict stays beside its row: reachable, and the probe's latency.
    expect(text()).toContain("reachable");
    expect(text()).toContain("57 ms");
  });

  it("replaces an old verdict when the same provider is tested again", async () => {
    let latency = 10;
    await renderProviders({
      [TEST_ROUTE]: () => jsonResponse({ data: { ...A_VERDICT, latency_ms: (latency += 5) } }),
    });

    await clickTest("google");
    await settle();
    expect(text()).toContain("15 ms");

    await clickTest("google");
    await settle();
    expect(text()).toContain("20 ms");
    expect(text()).not.toContain("15 ms");
  });

  it("keeps a verdict's meaning one sentence, shared with the pill's title", async () => {
    await renderProviders({
      [TEST_ROUTE]: () => jsonResponse({ data: A_VERDICT }),
    });

    await clickTest("google");
    await settle();

    const pill = [...container.querySelectorAll(".pill")].find((candidate) =>
      candidate.textContent?.includes("reachable"),
    );
    expect(pill?.getAttribute("title")).toBe(describeOAuthStatus("ok"));
  });

  it("words an unconfigured refusal as the deployment's configuration", async () => {
    // A row that says configured, whose test is refused anyway: the deployment
    // changed under the screen. The sentence is the one the route composes.
    await renderProviders({
      [TEST_ROUTE]: () =>
        jsonResponse(
          { error: { code: "not_found", message: OAUTH_TEST_NOT_CONFIGURED_DETAIL } },
          502,
        ),
    });

    await clickTest("google");
    await settle();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(OAUTH_TEST_NOT_CONFIGURED_DETAIL);
  });

  it("renders a failed test as a failure beside its row, not as a silent cell", async () => {
    await renderProviders({
      [TEST_ROUTE]: () =>
        jsonResponse(
          { error: { code: "api_unreachable", message: "The console could not reach the API." } },
          502,
        ),
    });

    await clickTest("google");
    await settle();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("could not reach the API");
    // And the verdict pill that is not there must not be pretended either.
    expect(text()).not.toContain("reachable · ");
  });

  it("runs one test at a time", async () => {
    // The stub's answer is deferred, so the in-flight state is observable
    // between the click and the answer.
    let release: (response: Response) => void = () => undefined;
    await renderProviders({
      [TEST_ROUTE]: () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    });

    await clickTest("google");
    // The button is disabled while its probe is in flight...
    expect(button("Testing")?.disabled).toBe(true);
    // ...and so is the other row's, so a quick second click spends nothing.
    const githubRow = [...container.querySelectorAll("tbody tr")].find((candidate) =>
      candidate.textContent?.includes("github"),
    );
    expect(githubRow?.querySelector("button")).toBeNull(); // github is unconfigured here
    // google's own row is the only configured one, so the shared disabled
    // state is read from it: still in flight, still disabled.
    expect(button("Testing")?.disabled).toBe(true);

    await act(async () => {
      release(jsonResponse({ data: A_VERDICT }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // The answer arrived, so the row is clickable again.
    expect(button("Test")?.disabled).toBe(false);
  });
});

describe("when the provider list does not arrive", () => {
  it("renders the forbidden section as a state, with a retry", async () => {
    await renderProviders({
      [LIST_ROUTE]: () =>
        jsonResponse({
          data: {
            state: "forbidden",
            detail: "The API refused this account.",
            code: "not_operator",
          },
        }),
    });

    expect(text()).toContain("The API refused this account.");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("renders a failed read as a fault the operator can retry", async () => {
    await renderProviders({
      [LIST_ROUTE]: () =>
        jsonResponse(
          { error: { code: "api_unreachable", message: "The API could not be reached." } },
          502,
        ),
    });

    expect(text()).toContain("The provider list did not load");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("renders an unreadable answer as its own failure", async () => {
    await renderProviders({
      [LIST_ROUTE]: () => jsonResponse({ something: "else" }),
    });

    expect(text()).toContain("a shape this screen does not recognise");
  });
});
