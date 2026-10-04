import { defineConfig } from "@playwright/test";

/**
 * A second Playwright config, for the guide's screenshots.
 *
 * Kept apart from `playwright.config.ts` on purpose. The e2e gate asserts
 * behaviour and must stay fast and deterministic; this run writes files into
 * `docs/guide/screenshots/` and is only ever started by hand with
 * `pnpm screenshots`. Merging them would mean every e2e run rewrote committed
 * images, so a passing gate would leave a dirty tree.
 *
 * Same origin rule as the gate: the route handlers refuse a request whose
 * `Origin` is not `WEBAUTHN_ORIGIN`.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/screenshots",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        baseURL,
        // Wide enough for the console's sidebar and content column side by side,
        // which is the layout the guide is describing.
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
