import { defineConfig, devices } from "@playwright/test";

/**
 * The origin the tests drive, which has to be the origin the console is
 * configured for: its route handlers refuse a request whose `Origin` is not
 * `WEBAUTHN_ORIGIN` (the WebAuthn relying party's own origin), so browsing to
 * the same server under a different name is a refused sign-in rather than a
 * development convenience.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * The console store the end-to-end tests write to, kept apart from the one a
 * developer's own `pnpm dev` uses.
 *
 * The step-up tests register real passkeys, and a passkey only ever comes off
 * the list by being removed, so they would otherwise leave rows behind in
 * `.csaxplus/console.sqlite` for an operator that never existed. A dedicated
 * file keeps that out of the way. It is not deleted between runs: every run
 * signs in as a fresh operator, so an old row can never be mistaken for this
 * run's, and deleting the file would mean a migration on every run for no gain.
 *
 * This applies only when Playwright starts the server itself. With
 * `E2E_BASE_URL` set, or with `reuseExistingServer`, the server is one somebody
 * else started and keeps whatever store it was given; the tests still pass,
 * they just leave their rows there.
 */
const E2E_STORE_PATH = ".csaxplus/e2e-console.sqlite";

/** The environment the server is started with, which must not be a blank one. */
function serverEnvironment(): Record<string, string> {
  const inherited = Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return { ...Object.fromEntries(inherited), CSAX_STORE_SQLITE_PATH: E2E_STORE_PATH };
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: serverEnvironment(),
      },
});
