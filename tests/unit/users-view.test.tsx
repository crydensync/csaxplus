// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UsersView } from "@/app/(console)/users/users-view";
import { SQLITE_ADMIN_DETAIL } from "@/lib/dashboard";
import {
  ACCOUNT_EXISTS_DETAIL,
  EXACT_EMAIL_MISS_DETAIL,
  NO_SUCH_ACCOUNT_DETAIL,
} from "@/lib/users";

/**
 * What the Users screen puts on the screen, for each state it can be in.
 *
 * The states cannot be reached in a browser from a test: every one of them needs
 * a signed-in operator, and a session needs a real sign-in against a real API.
 * So the rendering is checked here, with the console's own routes stubbed, and
 * the sign-in journey stays covered by the end-to-end suite.
 *
 * This is a real render rather than a shallow one: the component, its children
 * and their effects all run, and the assertions are against the text an operator
 * would read.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIST_ROUTE = "/api/console/users";
const FIRST_ID = "01J0000000000000000000000A";
const SECOND_ID = "01J0000000000000000000000B";

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

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: FIRST_ID,
    email: "operator@example.invalid",
    created_at: "2026-10-05T08:00:00Z",
    updated_at: "2026-10-05T09:30:00Z",
    failed_attempts: 0,
    locked: false,
    locked_until: null,
    ...overrides,
  };
}

const A_PAGE = {
  users: [account()],
  total: 1,
  limit: 25,
  offset: 0,
  match: "browse",
  query: "",
};

const A_DETAIL = {
  user: account(),
  active_sessions: 4,
  recent_activity: [
    {
      id: "01J0000000000000000000000C",
      type: "login_success",
      ip: "203.0.113.7",
      created_at: "2026-10-05T08:00:00Z",
    },
  ],
};

const A_METADATA = {
  user_id: FIRST_ID,
  metadata: { plan: "scale" },
  reserved_claim_names: ["sub", "role"],
};

/**
 * Answers the console's routes by path, and records what was asked for.
 *
 * The Users screen makes two different calls, so a single reply cannot describe
 * it: the drawer's read has to be able to succeed while the list's is refused.
 */
function stubRoutes(
  routes: Record<string, (url: URL, init?: RequestInit) => Response | Promise<Response>>,
) {
  const seen: string[] = [];

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost:3000");
    seen.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    // A path may carry different answers per verb, the way the console's own
    // routes do (GET lists, POST creates), so the key is both.
    const handler = routes[`${init?.method ?? "GET"} ${url.pathname}`] ?? routes[url.pathname];
    if (handler === undefined) throw new Error(`no stub for ${url.pathname}`);
    return handler(url);
  });

  return seen;
}

/** A section that answered, as the console's own route passes it through. */
function ok(data: unknown) {
  return { state: "ok", data };
}

/**
 * The list, with a search that finds nothing.
 *
 * Keyed on the query rather than on a call count, so each request is answered
 * for what it asked rather than for how many times it was asked.
 */
function missWhenSearched() {
  return (url: URL) =>
    jsonResponse({
      data: ok(
        url.searchParams.get("q") === null
          ? A_PAGE
          : { ...A_PAGE, users: [], total: 0, match: "exact_email" },
      ),
    });
}

/** Renders the screen against one page of accounts. */
async function renderUsers(
  routes: Record<string, (url: URL) => Response | Promise<Response>> = {},
) {
  const seen = stubRoutes({
    [LIST_ROUTE]: () => jsonResponse({ data: ok(A_PAGE) }),
    ...routes,
  });

  await act(async () => {
    root.render(<UsersView csrf="the-csrf-value" />);
  });

  return seen;
}

/**
 * The words on the screen.
 *
 * Read from the body rather than the container the render was mounted into,
 * because the drawer is rendered through a portal into the body: an overlay
 * inside a transformed ancestor is sized to that ancestor instead of the window.
 */
function text(): string {
  return document.body.textContent ?? "";
}

function rows(): HTMLTableRowElement[] {
  return [...container.querySelectorAll<HTMLTableRowElement>("tbody tr")];
}

/** React reads the value off the DOM node's own setter, so it has to be set that way. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function submit() {
  container
    .querySelector("form")
    ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
}

describe("while the accounts are being read", () => {
  it("shows the table's shape and claims nothing in it", async () => {
    // A route that never answers, so the loading state is the one on screen.
    await renderUsers({ [LIST_ROUTE]: () => new Promise<Response>(() => undefined) });

    for (const header of ["Account", "Created", "Last change", "Failed attempts", "Status"]) {
      expect(text()).toContain(header);
    }
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    // Announced once, politely, rather than a wall of meaningless boxes.
    expect(text()).toContain("Loading the accounts");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    // The controls are present and inert, so their arrival does not move the
    // table the operator is already reading.
    expect(button("Next")?.disabled).toBe(true);
    expect(button("Previous")?.disabled).toBe(true);
  });
});

describe("when the accounts arrive", () => {
  it("shows every field the API sent and nothing it did not", async () => {
    await renderUsers();

    expect(text()).toContain("operator@example.invalid");
    expect(text()).toContain("5 Oct 2026");
    expect(text()).toContain("active");
    expect(text()).toContain("Failed attempts");
    // The prototype's columns have no source in the API, so they are absent
    // rather than filled with something plausible. See DECISIONS.md D19.
    expect(text()).not.toContain("Last seen");
    expect(text()).not.toContain("Provider");
  });

  it("says how many accounts there are and which mode answered", async () => {
    await renderUsers();

    expect(text()).toContain("Showing 1 to 1 of 1");
    expect(text()).toContain("The API listed every account, newest first.");
  });

  it("names a lockout's expiry without printing a bare countdown", async () => {
    const locked = account({
      failed_attempts: 5,
      locked: true,
      locked_until: "2026-10-05T09:15:00Z",
    });
    await renderUsers({
      [LIST_ROUTE]: () => jsonResponse({ data: ok({ ...A_PAGE, users: [locked] }) }),
    });

    expect(text()).toContain("locked");
    expect(text()).not.toContain("active");
    // The expiry is the API's own instant, and it is what the pill says on
    // hover rather than a countdown this screen would have to keep recomputing.
    expect(rows()[0]?.querySelector(".pill")?.getAttribute("title")).toBe(
      "Locked until 5 Oct 2026, 09:15 UTC",
    );
  });

  it("says so when the deployment has no accounts at all", async () => {
    await renderUsers({
      [LIST_ROUTE]: () => jsonResponse({ data: ok({ ...A_PAGE, users: [], total: 0 }) }),
    });

    expect(text()).toContain("No accounts yet");
    expect(text()).toContain("No accounts in this answer.");
  });
});

describe("searching", () => {
  it("asks the API for the address and starts again from the first page", async () => {
    const seen = await renderUsers();
    // Move off the first page first, so the reset is observable.
    await act(async () => {
      button("Next")?.click();
    });

    await act(async () => {
      type(container.querySelector("input") as HTMLInputElement, "someone@example.invalid");
    });
    await act(async () => {
      submit();
    });

    expect(seen.at(-1)).toBe(`GET ${LIST_ROUTE}?q=someone%40example.invalid`);
    // A new question is a new first page: answering with offset 25 of a
    // different query would show a slice of an answer nobody asked for.
    expect(seen.at(-1)).not.toContain("offset");
  });

  it("trims what was typed rather than searching for whitespace", async () => {
    const seen = await renderUsers();

    await act(async () => {
      type(container.querySelector("input") as HTMLInputElement, "  operator@example.invalid  ");
    });
    await act(async () => {
      submit();
    });

    expect(seen.at(-1)).toBe(`GET ${LIST_ROUTE}?q=operator%40example.invalid`);
  });

  it("asks nothing of the API when the box is emptied by submitting", async () => {
    const seen = await renderUsers();

    await act(async () => {
      type(container.querySelector("input") as HTMLInputElement, "   ");
    });
    await act(async () => {
      submit();
    });

    // The address already on the screen, read again. Not a search for a space.
    expect(seen.at(-1)).toBe(`GET ${LIST_ROUTE}`);
  });

  it("explains a miss as an exact match rather than an account that is gone", async () => {
    await renderUsers({ [LIST_ROUTE]: missWhenSearched() });

    await act(async () => {
      type(container.querySelector("input") as HTMLInputElement, "nobody@example.invalid");
    });
    await act(async () => {
      submit();
    });

    expect(text()).toContain("No account matched that address");
    expect(text()).toContain(EXACT_EMAIL_MISS_DETAIL);
    // Not the sentence for an account the API has lost: the search worked, and
    // this is what a working search for one exact address looks like when it
    // finds nothing.
    expect(text()).not.toContain(NO_SUCH_ACCOUNT_DETAIL);
  });

  it("offers a way back to every account, and takes it", async () => {
    const seen = await renderUsers({ [LIST_ROUTE]: missWhenSearched() });

    await act(async () => {
      type(container.querySelector("input") as HTMLInputElement, "nobody@example.invalid");
    });
    await act(async () => {
      submit();
    });

    await act(async () => {
      button("Clear the search")?.click();
    });

    expect(seen.at(-1)).toBe(`GET ${LIST_ROUTE}`);
    expect((container.querySelector("input") as HTMLInputElement).value).toBe("");
    expect(text()).toContain("operator@example.invalid");
  });
});

describe("paging", () => {
  const MANY = {
    ...A_PAGE,
    users: [account(), account({ id: SECOND_ID, email: "second@example.invalid" })],
    total: 60,
    limit: 25,
  };

  it("asks for the next offset the API's own page size implies", async () => {
    const seen = await renderUsers({ [LIST_ROUTE]: () => jsonResponse({ data: ok(MANY) }) });

    expect(button("Previous")?.disabled).toBe(true);

    await act(async () => {
      button("Next")?.click();
    });

    expect(seen.at(-1)).toBe(`GET ${LIST_ROUTE}?offset=25`);
  });

  it("stops at the last page instead of asking for an empty one", async () => {
    await renderUsers({
      [LIST_ROUTE]: () => jsonResponse({ data: ok({ ...MANY, total: 27, offset: 25 }) }),
    });

    expect(button("Next")?.disabled).toBe(true);
    expect(button("Previous")?.disabled).toBe(false);
    expect(text()).toContain("Showing 26 to 27 of 27");
  });
});

describe("when the API refuses", () => {
  it("reads a SQLite deployment as having no admin surface", async () => {
    await renderUsers({
      [LIST_ROUTE]: () =>
        jsonResponse({
          data: {
            state: "unavailable",
            detail: SQLITE_ADMIN_DETAIL,
            code: "not_implemented_on_sqlite",
          },
        }),
    });

    expect(text()).toContain("Not available on this deployment");
    expect(text()).toContain(SQLITE_ADMIN_DETAIL);
    // Answered, not broken, so it is not announced as a fault.
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("reports a console route that failed with the code to chase", async () => {
    await renderUsers({
      [LIST_ROUTE]: () =>
        jsonResponse({ error: { code: "unauthenticated", message: "no session" } }, 401),
    });

    expect(text()).toContain("The account list did not load");
    expect(text()).toContain("no session");
    expect(text()).toContain("unauthenticated");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("does not render a half-filled table when the answer is unreadable", async () => {
    await renderUsers({ [LIST_ROUTE]: () => jsonResponse({ nothing: "useful" }) });

    expect(text()).toContain("The account list did not load");
    expect(text()).toContain("console_malformed");
    expect(rows()).toHaveLength(0);
  });
});

describe("the account drawer", () => {
  const WITH_DRAWER = {
    [LIST_ROUTE]: () => jsonResponse({ data: ok(A_PAGE) }),
    [`${LIST_ROUTE}/${FIRST_ID}`]: () =>
      jsonResponse({ data: { detail: ok(A_DETAIL), metadata: ok(A_METADATA) } }),
  };

  it("opens on a row and reads that account", async () => {
    const seen = await renderUsers(WITH_DRAWER);

    await act(async () => {
      rows()[0]?.click();
    });

    expect(seen.at(-1)).toBe(`GET ${LIST_ROUTE}/${FIRST_ID}`);
    const drawer = document.querySelector('[role="dialog"]');
    expect(drawer).not.toBeNull();
    expect(drawer?.getAttribute("aria-modal")).toBe("true");
    expect(text()).toContain("operator@example.invalid");
    expect(text()).toContain("4 sessions are live for this account right now");
    expect(text()).toContain("login_success");
  });

  it("prints the metadata as text, never as markup", async () => {
    await renderUsers({
      ...WITH_DRAWER,
      [`${LIST_ROUTE}/${FIRST_ID}`]: () =>
        jsonResponse({
          data: {
            detail: ok(A_DETAIL),
            metadata: ok({ ...A_METADATA, metadata: { note: "<b>not bold</b>" } }),
          },
        }),
    });

    await act(async () => {
      rows()[0]?.click();
    });

    const json = document.querySelector(".drawer-json");
    expect(json?.tagName).toBe("PRE");
    // Metadata is arbitrary JSON that ends up in a token's claims. An angle
    // bracket in it is a character, not an instruction to the browser.
    expect(json?.textContent).toContain("<b>not bold</b>");
    expect(json?.querySelector("b")).toBeNull();
    expect(text()).toContain("Reserved keys, which the API refuses: sub, role.");
  });

  it("says an account carries no metadata rather than showing an empty block", async () => {
    await renderUsers({
      ...WITH_DRAWER,
      [`${LIST_ROUTE}/${FIRST_ID}`]: () =>
        jsonResponse({
          data: {
            detail: ok(A_DETAIL),
            metadata: ok({ ...A_METADATA, metadata: {} }),
          },
        }),
    });

    await act(async () => {
      rows()[0]?.click();
    });

    expect(text()).toContain("No metadata");
    expect(document.querySelector(".drawer-json")).toBeNull();
  });

  it("closes on Escape and hands focus back to the row that opened it", async () => {
    await renderUsers(WITH_DRAWER);

    const row = rows()[0] as HTMLTableRowElement;
    // The keyboard route in: focus the row, then press Enter on it. The row is
    // what has to be focused again on the way out.
    await act(async () => {
      row.focus();
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    // Focus moved into the panel, onto its close control, so the operator is not
    // left tabbing behind an overlay they can see.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close details");
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(row);
    expect(document.body.style.overflow).toBe("");
  });

  it("says an account no longer resolves rather than blaming the deployment", async () => {
    await renderUsers({
      ...WITH_DRAWER,
      [`${LIST_ROUTE}/${FIRST_ID}`]: () =>
        jsonResponse({
          data: {
            detail: { state: "empty", detail: NO_SUCH_ACCOUNT_DETAIL },
            metadata: { state: "empty", detail: NO_SUCH_ACCOUNT_DETAIL },
          },
        }),
    });

    await act(async () => {
      rows()[0]?.click();
    });

    expect(text()).toContain(NO_SUCH_ACCOUNT_DETAIL);
  });

  it("still shows the account when its metadata could not be read", async () => {
    await renderUsers({
      ...WITH_DRAWER,
      [`${LIST_ROUTE}/${FIRST_ID}`]: () =>
        jsonResponse({
          data: {
            detail: ok(A_DETAIL),
            metadata: { state: "error", detail: "no metadata store", code: "internal_error" },
          },
        }),
    });

    await act(async () => {
      rows()[0]?.click();
    });

    expect(text()).toContain("operator@example.invalid");
    expect(text()).toContain("no metadata store");
    expect(text()).toContain("internal_error");
  });
});

describe("creating an account", () => {
  const CREATED = account({
    id: "01J0000000000000000000000D",
    email: "newbie@example.invalid",
  });
  const WITH_CREATE = {
    [`GET ${LIST_ROUTE}`]: () => jsonResponse({ data: ok(A_PAGE) }),
    [`${LIST_ROUTE}/${FIRST_ID}`]: () =>
      jsonResponse({ data: { detail: ok(A_DETAIL), metadata: ok(A_METADATA) } }),
    [`${LIST_ROUTE}/${CREATED.id}`]: () =>
      jsonResponse({
        data: {
          detail: ok({ ...A_DETAIL, user: CREATED }),
          metadata: ok({ ...A_METADATA, user_id: CREATED.id }),
        },
      }),
    [`POST ${LIST_ROUTE}`]: () => jsonResponse({ data: { user: CREATED } }, 201),
  };

  it("opens the form from the toolbar and sends the email and password", async () => {
    const seen = await renderUsers(WITH_CREATE);

    await act(async () => {
      button("New account")?.click();
    });

    const form = document.querySelector('[role="dialog"] form');
    expect(form).not.toBeNull();

    await act(async () => {
      type(
        document.getElementById("create-account-email") as HTMLInputElement,
        "newbie@example.invalid",
      );
      type(
        document.getElementById("create-account-password") as HTMLInputElement,
        "a first password",
      );
      type(
        document.getElementById("create-account-password-2") as HTMLInputElement,
        "a first password",
      );
    });
    await act(async () => {
      (form as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(seen).toContain(`POST ${LIST_ROUTE}`);
    // The drawer opened on the account the API answered with, which is a row
    // click's journey, so the operator sees the account they made.
    expect(text()).toContain("newbie@example.invalid");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("says a duplicate address is an existing account, not a console fault", async () => {
    await renderUsers({
      ...WITH_CREATE,
      [`POST ${LIST_ROUTE}`]: () =>
        jsonResponse(
          { error: { code: "user_exists", message: "an account with this email already exists" } },
          409,
        ),
    });

    await act(async () => {
      button("New account")?.click();
    });

    await act(async () => {
      type(
        document.getElementById("create-account-email") as HTMLInputElement,
        "operator@example.invalid",
      );
      type(
        document.getElementById("create-account-password") as HTMLInputElement,
        "a first password",
      );
      type(
        document.getElementById("create-account-password-2") as HTMLInputElement,
        "a first password",
      );
      document
        .querySelector('[role="dialog"] form')!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(text()).toContain(ACCOUNT_EXISTS_DETAIL);
    // The form stays open with the failure in it, and the failure is not the
    // API's generic sentence but the one that says what to do instead.
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(text()).not.toContain("an account with this email already exists");
  });
});
