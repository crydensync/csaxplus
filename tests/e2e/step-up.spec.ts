import { expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";

import { signInToConsole } from "./console-session";

/**
 * The step-up ceremony, driven by a real browser.
 *
 * Everything else about step-up is covered by unit tests that call the route
 * handlers directly. What none of those can show is the part that only exists in
 * a browser: the WebAuthn call itself, the console's own client code that runs
 * it, and whether the route and the screen agree about what was just done. This
 * test drives all of that against Chromium's virtual authenticator, which is a
 * real authenticator as far as the page is concerned: it holds keys, it signs
 * challenges, and it will refuse a challenge that does not match.
 *
 * The four things it establishes, in the order the console's rules apply:
 *
 * 1. The first passkey is registered with no step-up, because there would be
 *    nothing to step up with.
 * 2. The second one is, and the console really does ask: the assertion is that
 *    a step-up request went out, not merely that the passkey appeared.
 * 3. Removing one is gated the same way.
 * 4. The last one cannot be removed, and the screen says so rather than offering
 *    a button that would be refused. The route's own refusal is a 409 covered by
 *    the unit tests; through the screen the operator never reaches it.
 *
 * The session is minted rather than signed in for: the sign-in screen needs an
 * API, and `CRYDEN_MODE` has no adapter that can authenticate anyone. See
 * `console-session.ts`.
 */

/**
 * Attaches a virtual authenticator to the page and returns its CDP session.
 *
 * The relying party id is not set here: the authenticator answers whatever the
 * page asks for, which is the console's own `WEBAUTHN_RP_ID`, so the ceremony
 * is exercised with the real value rather than one this test chose.
 *
 * `transport` is how the test models a second device. A platform authenticator
 * holds one credential per account and refuses to enrol the same one twice, so
 * a second passkey means a second authenticator, exactly as it does for a real
 * operator adding a phone alongside a laptop. Registering two on one
 * authenticator is not a case a browser would ever let through, and this test
 * would be asserting something impossible if it tried.
 */
async function addAuthenticator(
  page: Page,
  transport: "internal" | "usb",
): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable", { enableUI: false });
  await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport,
      // Resident keys, so the credential is discoverable: a step-up asks for an
      // assertion without naming a credential, the way a real platform key with
      // a resident credential behaves.
      hasResidentKey: true,
      hasUserVerification: true,
      // The authenticator answers "yes, it is them" on its own, so no prompt is
      // simulated. What is being tested is the console, not the browser's UI.
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return client;
}

/** Every step-up request the page made, in order. */
function watchStepUps(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/api/console/step-up/")) seen.push(pathname);
  });
  return seen;
}

async function addPasskey(page: Page, name: string): Promise<void> {
  await page.locator("#passkey-name").fill(name);
  await page.getByRole("button", { name: "Add passkey" }).click();
}

/** One row per registered passkey, so a count is the list's real length. */
function passkeyRows(page: Page) {
  return page.locator(".passkey-list li");
}

/**
 * How long to wait for the screen to reach a state.
 *
 * Generous for a reason that has bitten this suite once already: the first
 * request to a route in a development server pays for a cold compile, which has
 * been measured at over twenty seconds here. A five-second assertion against a
 * route nobody has hit yet fails on the compile, not on the thing being tested.
 * The same allowance is why the sign-in redirect test calls `test.slow()`.
 */
const SETTLE_TIMEOUT_MS = 60_000;

test("registers, gates and removes passkeys", async ({ page }) => {
  // Several ceremonies, each a handful of round trips, against a server that
  // may still be compiling. The default budget is for a page load, not this.
  test.slow();

  await addAuthenticator(page, "internal");
  const stepUps = watchStepUps(page);
  await signInToConsole(page);

  // Wait for the read to land before touching anything. Interacting with the
  // form while the list is still loading would race it, and the screen decides
  // whether to ask for a step-up from what the list says.
  await expect(page.getByRole("heading", { name: "Step-up passkeys" })).toBeVisible();
  await expect(page.getByText("No passkey yet")).toBeVisible({ timeout: SETTLE_TIMEOUT_MS });

  // The first one. Nothing to step up with yet, so the console must not ask.
  await addPasskey(page, "First key");
  await expect(passkeyRows(page)).toHaveCount(1, { timeout: SETTLE_TIMEOUT_MS });
  await expect(page.getByText("First key")).toBeVisible();
  expect(stepUps).toEqual([]);

  // The second one, on a second device. Now there is something to confirm with,
  // and the console has to ask: this is the assertion that the gate is real,
  // rather than the ceremony having quietly gone through ungated.
  await addAuthenticator(page, "usb");
  await addPasskey(page, "Second key");
  await expect(passkeyRows(page)).toHaveCount(2, { timeout: SETTLE_TIMEOUT_MS });
  expect(stepUps).toContain("/api/console/step-up/options");
  expect(stepUps).toContain("/api/console/step-up/verify");

  stepUps.length = 0;

  // Removing one is gated the same way.
  await passkeyRows(page)
    .filter({ hasText: "First key" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(passkeyRows(page)).toHaveCount(1, { timeout: SETTLE_TIMEOUT_MS });
  await expect(page.getByText("Second key")).toBeVisible();
  expect(stepUps).toContain("/api/console/step-up/options");

  // The last one stays, and the screen does not offer to remove it.
  const onlyRemove = passkeyRows(page).getByRole("button", { name: "Remove" });
  await expect(onlyRemove).toBeDisabled();
  await expect(onlyRemove).toHaveAttribute(
    "title",
    "This is your only passkey. Add another before removing it.",
  );
});

test("a viewer is not offered a passkey at all", async ({ page }) => {
  test.slow();

  await addAuthenticator(page, "internal");
  // A viewer may read, not change. The options route checks the role before it
  // looks at anything else, so what this checks is that the refusal arrives as
  // the console's own sentence rather than as a broken screen.
  await signInToConsole(page, { role: "viewer" });

  await expect(page.getByRole("heading", { name: "Step-up passkeys" })).toBeVisible();
  await expect(page.getByText("No passkey yet")).toBeVisible({ timeout: SETTLE_TIMEOUT_MS });

  await addPasskey(page, "Should not exist");

  await expect(page.getByText("Your role can read, not change.")).toBeVisible({
    timeout: SETTLE_TIMEOUT_MS,
  });
  await expect(passkeyRows(page)).toHaveCount(0);
});
