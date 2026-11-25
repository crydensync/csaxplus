import { expect, test } from "@playwright/test";

import { signInToConsole } from "./console-session";

test("Support Assistant diagnoses an exact email and copies the report for manual escalation", async ({
  page,
}) => {
  await signInToConsole(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const report = "Login diagnosis for casey@example.com\nAccount is not locked.";
  await page.route("**/api/console/support**", async (route) => {
    expect(new URL(route.request().url()).searchParams.get("email")).toBe("casey@example.com");
    await route.fulfill({ json: { data: { email: "casey@example.com", text: report } } });
  });

  await page.goto("/support");
  await page.getByLabel("Account email").fill("casey@example.com");
  await page.getByRole("button", { name: "Run diagnosis" }).click();
  await expect(
    page.getByRole("heading", { name: "Diagnosis for casey@example.com" }),
  ).toBeVisible();
  await expect(page.getByText(report)).toBeVisible();
  await page.getByRole("button", { name: "Copy diagnosis" }).click();
  await expect(page.getByRole("status")).toHaveText("Diagnosis copied for your support workflow.");
  await expect(page.getByText(/Ticketing integrations are coming soon/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `casey@example.com\n\n${report}`,
  );
});
