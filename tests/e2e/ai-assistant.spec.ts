import { expect, test } from "@playwright/test";

import { signInToConsole } from "./console-session";

test("admin AI modes keep their source citations and send CSRF-protected requests", async ({
  page,
}) => {
  const session = await signInToConsole(page);
  await page.goto("/ai");

  await page.route("**/api/console/ai/logs", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-csrf-token"]).toBe(session.csrf);
    await route.fulfill({
      json: {
        data: { answer: "Two repeated errors.", source_entity: "shipped_logs", row_count: 2 },
      },
    });
  });
  await page.getByRole("button", { name: "Log summary" }).click();
  await page.getByRole("button", { name: "Summarize logs" }).click();
  await expect(page.getByText("Source: shipped_logs · 2 rows")).toBeVisible();

  await page.route("**/api/console/ai/anomalies-scan", async (route) => {
    expect(JSON.parse(route.request().postData() ?? "{}")).toEqual({ since: "7d" });
    await route.fulfill({
      json: {
        data: {
          answer: "One flagged event.",
          source_entity: "anomalies",
          row_count: 1,
          since: "7d",
        },
      },
    });
  });
  await page.getByRole("button", { name: "Anomaly scan" }).click();
  await page.getByLabel("Time window").selectOption("7d");
  await page.getByRole("button", { name: "Scan events" }).click();
  await expect(page.getByText("Source: anomalies · 1 rows")).toBeVisible();

  await page.route("**/api/console/ai/audit", async (route) => {
    expect(JSON.parse(route.request().postData() ?? "{}")).toEqual({ question: "recent lockouts" });
    await route.fulfill({
      json: {
        data: { entity: "audit_events", columns: ["type"], rows: [["login_locked"]], row_count: 1 },
      },
    });
  });
  await page.getByRole("button", { name: "Audit query" }).click();
  await page.getByLabel("Question").fill("recent lockouts");
  await page.getByRole("button", { name: "Query audit" }).click();
  await expect(page.getByText("Source: audit_events")).toBeVisible();
  await expect(page.getByText("login_locked")).toBeVisible();

  await page.route("**/api/console/ai/ask", async (route) => {
    await route.fulfill({
      json: { data: { answer: "Three accounts matched.", source_entity: "users", row_count: 3 } },
    });
  });
  await page.getByRole("button", { name: "Ask admin AI" }).click();
  await page.getByLabel("Question").fill("who has locked accounts?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("Three accounts matched.")).toBeVisible();
  await expect(page.getByText("Source: users · 3 rows")).toBeVisible();
});
