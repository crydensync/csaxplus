import { randomBytes, randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { sealConsoleSession, SESSION_COOKIE } from "../support/console-cookie";

/**
 * Signs a browser into the console without going through the sign-in form.
 *
 * The console's session is one encrypted cookie and nothing else: there is no
 * server-side session table, so a test that can mint that cookie is signed in as
 * far as every route is concerned. That is what this does, rather than driving
 * the sign-in screen, which needs a real API behind it (`CRYDEN_MODE` has no
 * fixture that can authenticate anyone).
 *
 * The cookie format itself lives in `tests/support/console-cookie.ts`, which the
 * screenshot capture uses too. Read its header before changing anything about
 * the sealing: it is a copy of `src/server/auth/sealed.ts`, and a change there
 * that is not mirrored in it fails as a browser sitting on the sign-in screen
 * with nothing to say why.
 *
 * The secret is read from the same `.env` files `next dev` reads, so the cookie
 * this mints matches the server on the other end whether Playwright started it
 * or reused one that was already running. A server started with a *different*
 * secret cannot be detected from here, only its effect: the browser is bounced
 * to the sign-in screen, and `signInToConsole` says so rather than letting the
 * test fail on a missing heading.
 */

export type ConsoleOperator = {
  id: string;
  label: string;
  role: "owner" | "admin" | "viewer";
};

/** A signed-in console session, as the test needs to think about it. */
export type ConsoleSignIn = {
  operator: ConsoleOperator;
  /** The session's CSRF token, which every mutation from the browser must carry. */
  csrf: string;
  sessionId: string;
};

/**
 * Puts a console session in the browser's cookie jar and checks it took.
 *
 * Waiting for the account screen and looking at where the browser ended up is
 * the only way to tell a good cookie from one the server refused, so it is done
 * here, once, with a message that names the likely cause.
 *
 * The CSRF token is returned as well as sealed, because the test needs it to
 * make any mutation: it is the value the page's client code is handed and
 * echoes in a header, and the encrypted cookie it is stored in is one a browser
 * script cannot read. Were this test driving the sign-in form it would have to
 * scrape the token out of the rendered payload; minting the session, it simply
 * already knows it.
 */
export async function signInToConsole(
  page: Page,
  operator: Partial<ConsoleOperator> = {},
): Promise<ConsoleSignIn> {
  const signedIn: ConsoleOperator = {
    // A fresh operator every run, so passkeys left behind by an earlier run are
    // never mistaken for this one's. The store is the console's, and a test that
    // tidied up would be a test that could pass by having deleted the wrong row.
    id: randomUUID(),
    label: "e2e@example.test",
    role: "admin",
    ...operator,
  };
  const sessionId = randomUUID();
  const csrf = randomBytes(32).toString("base64url");

  const cookie = await sealConsoleSession({
    sid: sessionId,
    operator: signedIn,
    csrf,
  });

  await page.context().addCookies([
    {
      name: SESSION_COOKIE,
      value: cookie,
      url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/account");
  if (new URL(page.url()).pathname !== "/account") {
    throw new Error(
      "The console did not accept the session this test minted, so the browser was sent to " +
        `${new URL(page.url()).pathname}. The usual cause is a development server that is ` +
        "already running with a different CSAX_SESSION_SECRET from the one in .env: stop it " +
        "and let Playwright start its own, or restart it so it picks the current value up. " +
        "A secondary cause is a change to the sealed-cookie format in " +
        "src/server/auth/sealed.ts that tests/support/console-cookie.ts has not followed.",
    );
  }

  return { operator: signedIn, csrf, sessionId };
}
