import { expect, test } from "@playwright/test";

import { signInToConsole } from "./console-session";

test("Weekly Digest edits a timezone-aware schedule and keeps unavailable delivery disabled", async ({
  page,
}) => {
  const session = await signInToConsole(page);
  await page.route("**/api/console/digest", async (route) => {
    await route.fulfill({
      json: { data: { state: "ok", data: { runs: [], count: 0, limit: 50 } } },
    });
  });
  await page.route("**/api/console/digest/settings", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: {
          data: {
            enabled: true,
            day_of_week: "friday",
            time: "16:30",
            timezone: "Africa/Casablanca",
            recipients: ["security@example.com"],
            delivery_enabled: false,
            delivery_available: false,
          },
        },
      });
      return;
    }
    expect(route.request().headers()["x-csrf-token"]).toBe(session.csrf);
    expect(JSON.parse(route.request().postData() ?? "{}")).toEqual({
      enabled: true,
      day_of_week: "monday",
      time: "08:15",
      timezone: "Europe/London",
      recipients: ["security@example.com", "oncall@example.com"],
      delivery_enabled: false,
    });
    await route.fulfill({
      json: {
        data: {
          enabled: true,
          day_of_week: "monday",
          time: "08:15",
          timezone: "Europe/London",
          recipients: ["security@example.com", "oncall@example.com"],
          delivery_enabled: false,
          delivery_available: false,
        },
      },
    });
  });

  await page.goto("/digest");
  await expect(page.getByRole("heading", { name: "Digest schedule" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Send the digest by email" })).toBeDisabled();
  await expect(page.getByText(/has no email sender/)).toBeVisible();

  await page.getByLabel("Day of week").selectOption("monday");
  await page.getByLabel("Local time").fill("08:15");
  await page.getByLabel("Timezone").fill("Europe/London");
  await page.getByLabel("Email recipients").fill("security@example.com\noncall@example.com");
  await page.getByRole("button", { name: "Save schedule" }).click();

  await expect(page.getByLabel("Timezone")).toHaveValue("Europe/London");
  await expect(page.getByLabel("Email recipients")).toHaveValue(
    "security@example.com\noncall@example.com",
  );
  await expect(page.getByText("No digests stored")).toBeVisible();
});
