import { expect, test } from "@playwright/test";

import { signInToConsole } from "./console-session";

test("AI assistant reports its maintenance status", async ({ page }) => {
  await signInToConsole(page);
  await page.goto("/ai");

  await expect(page.getByRole("heading", { name: "AI features are being worked on" })).toBeVisible();
  await expect(
    page.getByText(/temporarily locked while we finish verifying model requests/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Log summary" })).toHaveCount(0);
});
