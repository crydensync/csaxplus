import { expect, test, type Page } from "@playwright/test";

import { localSetting, mintSessionCookie } from "./session";

/**
 * Writes the guide's screenshots into `docs/guide/screenshots/`.
 *
 * Run by hand: `pnpm screenshots`. Not part of the e2e gate, so a gate run
 * never rewrites a committed image.
 *
 * Every shot is of a state the console can actually reach. Nothing is posed: if
 * a screen has no data, the image shows the state that screen shows, which for
 * most of the console today is the honest "not built yet" page. A screenshot of
 * a console full of stand-in numbers would be the most convincing possible
 * version of a lie.
 */

const OUTPUT = "docs/guide/screenshots";

/** Screenshots wait for fonts and the first paint; animations are cut, not captured mid-frame. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle");
}

test.describe("guide screenshots", () => {
  test("the landing page", async ({ page }) => {
    await page.goto("/");
    await settle(page);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: `${OUTPUT}/landing-hero.png`,
      animations: "disabled",
    });

    await page.locator("#console").scrollIntoViewIfNeeded();
    await page.locator("#console").screenshot({
      path: `${OUTPUT}/landing-console-map.png`,
      animations: "disabled",
    });
  });

  test("the sign-in screen", async ({ page }) => {
    await page.goto("/login");
    await settle(page);

    await expect(page.getByLabel("Password")).toBeVisible();
    await page.screenshot({
      path: `${OUTPUT}/sign-in.png`,
      animations: "disabled",
    });
  });

  test("the design system gallery", async ({ page }) => {
    await page.goto("/design");
    await settle(page);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({
      path: `${OUTPUT}/design-system.png`,
      animations: "disabled",
    });
  });

  test("the console screens", async ({ page, context }) => {
    // Two ways to get a session, and which one is available decides what the
    // console images show. With credentials the shot is of a real deployment,
    // tiles and rows and all. Without them the minted cookie gives a signed-in
    // shell whose API tokens are placeholders, so the dashboard shows the state
    // it shows an operator when the API cannot be reached, which is still a
    // state the console really reaches.
    //
    // The credentials come from the environment or the gitignored `.env.local`,
    // never from this file: a password written down here would be a password in
    // the repository.
    const email = localSetting("CSAX_SCREENSHOT_EMAIL");
    const password = localSetting("CSAX_SCREENSHOT_PASSWORD");

    if (email !== undefined && password !== undefined) {
      await page.goto("/login");
      await settle(page);
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      // A cold dev server compiles the console and the route behind the form.
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 });
    } else {
      const cookie = await mintSessionCookie();
      test.skip(
        cookie === null,
        "no CSAX_SCREENSHOT_EMAIL/CSAX_SCREENSHOT_PASSWORD and no CSAX_SESSION_SECRET to mint one with",
      );
      if (cookie === null) return;

      await context.addCookies([
        { name: cookie.name, value: cookie.value, url: "http://localhost:3000" },
      ]);

      await page.goto("/dashboard");
    }

    await settle(page);

    // Whichever way the session was obtained, this proves the shot is of a real
    // signed-in render rather than the sign-in redirect.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // The dashboard reads its reports after hydration, and `settle` can return
    // before that first fetch lands, which photographs the skeletons. Wait for
    // the screen to leave its loading state: every skeleton is replaced by a
    // tile, a table row or a state block, so none of them surviving is the
    // signal that the screen has settled.
    //
    // The wait is long because the first fetch compiles the console's own route
    // and then makes four calls to the API behind it: the route alone measured
    // over six seconds cold on this machine, against a default of five.
    await expect(page.locator(".skeleton")).toHaveCount(0, { timeout: 60_000 });

    await page.screenshot({
      path: `${OUTPUT}/console-dashboard.png`,
      animations: "disabled",
    });

    // The second screen with real content. Same wait as the dashboard's, for the
    // same reason: the accounts are read after hydration, and photographing the
    // skeletons would be a picture of the console thinking rather than of what
    // it found. With a minted cookie this lands on the screen's own failure
    // state, which is still a state the console really reaches.
    await page.goto("/users");
    await settle(page);
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    // This screen lists every account the deployment holds, and a guide image
    // must not publish the addresses of accounts the reader has nothing to do
    // with. So the shot is taken through the screen's own search, narrowed to
    // the one account this run signed in as: a real call, a real row, and no
    // one else's address in the repository. The dashboard above photographs
    // whatever the deployment's newest accounts are, which is why its image is
    // the one committed from a deployment holding sample data only.
    if (email !== undefined) {
      await page.getByLabel("Search by exact email").fill(email);
      await page.getByRole("button", { name: "Search", exact: true }).click();
    }

    await expect(page.locator(".skeleton")).toHaveCount(0, { timeout: 60_000 });
    await page.screenshot({
      path: `${OUTPUT}/console-users.png`,
      animations: "disabled",
    });

    // The operator's own screen, and the only one in the console reached from
    // something other than the sidebar's list of screens: the chip at its foot.
    // Its list is read after hydration like the two above, so it gets the same
    // wait. Shot with a minted cookie it shows the empty state, which is the
    // state a deployment is in until somebody enrols their first passkey.
    await page.goto("/account");
    await settle(page);
    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
    await expect(page.locator(".skeleton")).toHaveCount(0, { timeout: 60_000 });
    await page.screenshot({
      path: `${OUTPUT}/console-account.png`,
      animations: "disabled",
    });

    // A screen the sidebar links to but no tier has built. The image is of the
    // gap, stated plainly, which is what a reader of the guide should see.
    await page.goto("/mfa");
    await settle(page);
    await expect(page.getByRole("heading", { name: "MFA & Passkeys" })).toBeVisible();
    await page.screenshot({
      path: `${OUTPUT}/console-screen-not-built-yet.png`,
      animations: "disabled",
    });
  });
});
