import { expect, test, type Page } from "@playwright/test";

import { mintSessionCookie } from "./session";

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

  test("the console, with a session minted locally", async ({ page, context }) => {
    const cookie = await mintSessionCookie();
    test.skip(
      cookie === null,
      "no CSAX_SESSION_SECRET in .env.local, so a console session cannot be minted here",
    );
    if (cookie === null) return;

    await context.addCookies([
      { name: cookie.name, value: cookie.value, url: "http://localhost:3000" },
    ]);

    await page.goto("/dashboard");
    await settle(page);

    // The minted cookie is the console's own format, so this proves the shot is
    // of a real signed-in render rather than the sign-in redirect.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.screenshot({
      path: `${OUTPUT}/console-dashboard.png`,
      animations: "disabled",
    });

    // A screen the sidebar links to but no tier has built. The image is of the
    // gap, stated plainly, which is what a reader of the guide should see.
    await page.goto("/users");
    await settle(page);
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await page.screenshot({
      path: `${OUTPUT}/console-screen-not-built-yet.png`,
      animations: "disabled",
    });
  });
});
