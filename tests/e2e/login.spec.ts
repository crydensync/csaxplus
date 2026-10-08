import { expect, test } from "@playwright/test";

/**
 * The sign-in screen, against whatever API the dev server was configured with.
 *
 * Two things shape what can be asserted here. The console talks to the API
 * server-side, so the browser's network never carries an API call and Playwright
 * cannot intercept one; and the fixtures adapter (step 0.6) does not exist yet,
 * so with no API listening the only reachable outcome is the console reporting
 * that it could not reach the API. That is the state these tests pin down: a
 * sign-in that did not happen must say so, in place, and must not open the
 * console. The success and second-factor paths need the fixtures adapter and are
 * covered by the unit tests until then.
 */
test.describe("sign-in", () => {
  test("a signed-out visit to the console is sent to the sign-in screen", async ({ page }) => {
    // Two of the routes under the console group, one of them added after the
    // guard was: the check lives in the group's layout, so every screen in it is
    // behind the gate rather than each screen remembering to be.
    //
    // Signed out, neither route renders anything: the layout redirects before a
    // screen is reached. What this test still pays for is each route's first
    // compile in the development server, and a screen's worth of modules has
    // taken over thirty seconds here. The same allowance the landing page's
    // redirect test takes, for the same reason.
    test.slow();

    for (const route of ["/dashboard", "/users"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("the screen says what it is for and offers both fields", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("CRYDENSYNC CONSOLE")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeEditable();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();

    // The two steps are shown from the start, so the operator knows a second one
    // may follow rather than being surprised by it.
    const steps = page.locator(".auth-step");
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(1)).toHaveText(/Second factor/);
    await expect(steps.first()).toHaveAttribute("aria-current", "step");
  });

  test("the first field takes focus, so the form needs no mouse", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeFocused();
  });

  test("a sign-in that did not happen is reported in place and opens nothing", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("operator@example.invalid");
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Announced, not just drawn: this is the only thing between the operator and
    // a screen that looks like it worked. Scoped to the form's own error block,
    // because Next's route announcer is a live region with the same role.
    //
    // The wait is for the first sign-in on a cold dev server, which compiles the
    // route on this submit: measured at around 6 seconds here, against a default
    // 5. It is a compile, not a failure, so the assertion gets the room.
    const alert = page.locator(".auth-error").getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText("That sign-in did not go through");

    // The console's own failure vocabulary, so the code can be matched against
    // logs. Which one depends on whether an API is listening: unreachable when
    // there is none, invalid_credentials or rate_limited when there is.
    await expect(alert.locator(".mono")).toHaveText(
      /api_unreachable|invalid_credentials|rate_limited/,
    );

    // Still on the sign-in screen, and no session was minted.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("Password")).toBeVisible();
    const cookies = await context.cookies();
    expect(cookies.map((cookie) => cookie.name)).not.toContain("csax_session");
  });

  test("every control is reachable by keyboard and shows a focus ring", async ({ page }) => {
    await page.goto("/login");

    // Where this test starts tabbing depends on the screen having focused its
    // first field, which it does in an effect once it is interactive. Tabbing
    // before that starts from the document body, and the first Tab lands on the
    // email field rather than on the password, so the order is asserted first
    // rather than assumed. The test above pins the same behaviour on its own.
    await expect(page.getByLabel("Email")).toBeFocused();

    // Tab order follows the reading order: email, password, submit.
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password")).toBeFocused();
    await page.keyboard.press("Tab");

    const button = page.getByRole("button", { name: "Sign in" });
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS("outline-style", "solid");
    await expect(button).toHaveCSS("outline-width", "2px");
  });

  test("the screen fits a 375 pixel viewport", async ({ page }) => {
    await page.goto("/login");

    // Measured inside an iframe of exactly that width. Headless Chrome clamps
    // the window, so a narrow viewport set on the page itself would report a
    // layout the operator never sees.
    const layout = await page.evaluate(async () => {
      const frame = document.createElement("iframe");
      frame.setAttribute("title", "narrow");
      frame.style.cssText = "width:375px;height:720px;border:0";
      frame.src = "/login";
      document.body.append(frame);
      await new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));

      const doc = frame.contentDocument;
      if (doc === null) throw new Error("the harness iframe did not load");

      let widest = 0;
      for (const element of doc.querySelectorAll("*")) {
        const right = element.getBoundingClientRect().right;
        if (right > widest) widest = right;
      }
      const card = doc.querySelector(".auth-card");
      return {
        scrollWidth: doc.documentElement.scrollWidth,
        clientWidth: doc.documentElement.clientWidth,
        widest,
        cardWidth: card === null ? 0 : card.getBoundingClientRect().width,
      };
    });

    expect(layout.clientWidth).toBe(375);
    // Nothing sticks out, and the card is inset by the screen's own padding
    // rather than running to the edges.
    expect(layout.scrollWidth).toBeLessThanOrEqual(375);
    expect(layout.widest).toBeLessThanOrEqual(375);
    expect(layout.cardWidth).toBeLessThanOrEqual(375);
  });
});
