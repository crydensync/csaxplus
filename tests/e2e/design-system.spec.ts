import { expect, test } from "@playwright/test";

/**
 * The design system's contract, checked against the dev-only gallery at /design.
 * These are the behaviours the prototype's markup did not have: keyboard-operable
 * dialogs, a real switch, an empty/error/loading story, and a table that scrolls
 * sideways rather than squashing its columns.
 */
test.describe("design system", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/design");
  });

  test("sidebar marks the current section and reaches the page", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Console sections" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/users");
    await expect(page.getByRole("banner")).toBeVisible();
  });

  test("wide tables live in a horizontal scroll container", async ({ page }) => {
    const wraps = page.locator(".table-wrap");
    await expect(wraps.first()).toBeVisible();

    const scrollsSideways = await page
      .locator(".table-scroll")
      .first()
      .evaluate((element) => getComputedStyle(element).overflowX);
    expect(scrollsSideways).toBe("auto");
  });

  test("the toggle is a switch and reports its state", async ({ page }) => {
    const first = page.getByRole("switch", { name: "First setting" });
    await expect(first).toBeChecked();
    await first.click();
    await expect(first).not.toBeChecked();

    const locked = page.getByRole("switch", { name: "Locked setting" });
    await expect(locked).toBeDisabled();
  });

  test("a dialog takes focus, keeps Tab inside, closes on Escape and restores focus", async ({
    page,
  }) => {
    const opener = page.getByRole("button", { name: "Open prompt" });
    await opener.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName("Confirm this action");

    // Tab must not escape the dialog.
    for (let press = 0; press < 4; press += 1) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const active = document.activeElement;
        const card = document.querySelector(".modal-card");
        return card !== null && active !== null && card.contains(active);
      });
      expect(inside).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("an empty result and a failed call each say what happened", async ({ page }) => {
    await expect(page.getByText("Nothing here yet")).toBeVisible();
    await expect(page.getByText("The preview could not load its rows.")).toBeVisible();
    await expect(page.getByText("preview_unavailable")).toBeVisible();
  });

  test("a toast reports the outcome and can be dismissed", async ({ page }) => {
    await page.getByRole("button", { name: "Success toast" }).click();
    const toast = page.locator(".toast");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("Saved");

    await toast.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(toast).toBeHidden();
  });

  test("loading placeholders are hidden from assistive technology", async ({ page }) => {
    const skeletons = page.locator(".skeleton");
    expect(await skeletons.count()).toBeGreaterThan(0);
    await expect(skeletons.first()).toHaveAttribute("aria-hidden", "true");
  });
});
