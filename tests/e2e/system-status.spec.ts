import { expect, test } from "@playwright/test";

import { signInToConsole } from "./console-session";

test("System Status renders aggregate health and migration results", async ({ page }) => {
  const session = await signInToConsole(page);
  await page.route("**/api/console/system", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().cookie).toBeTruthy();
    await route.fulfill({
      json: {
        data: {
          stats: {
            state: "ok",
            data: { users: 18, active_sessions: 4, operators: 2, active_api_keys: 3 },
          },
          doctor: {
            state: "ok",
            data: {
              status: "degraded",
              checked_at: "2026-11-15T12:00:00Z",
              checks: [
                {
                  name: "database",
                  status: "healthy",
                  detail: "The authentication database answered.",
                },
                {
                  name: "migrations",
                  status: "attention",
                  detail: "The database migration records do not match this API build.",
                },
              ],
            },
          },
          migrations: {
            state: "ok",
            data: {
              current: "001_initial_schema.up.sql",
              applied: [{ name: "001_initial_schema.up.sql", applied_at: "2026-11-15T11:00:00Z" }],
              pending: ["002_users.up.sql"],
              unknown: [],
            },
          },
        },
      },
    });
  });

  await page.goto("/system");
  await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
  await expect(page.getByText("Active sessions")).toBeVisible();
  await expect(
    page.getByText("The database migration records do not match this API build."),
  ).toBeVisible();
  await expect(page.getByText("002_users.up.sql")).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(
    page.getByRole("heading", { name: "Authentication schema migrations" }),
  ).toBeVisible();
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(session.csrf).toBeTruthy();
});
