import { readFileSync } from "node:fs";
import path from "node:path";

import { sealConsoleSession, sessionSecret, SESSION_COOKIE } from "../support/console-cookie";

/**
 * Mints a session cookie for the screenshot run, so the console can be
 * photographed without a CrydenSync API to sign in against.
 *
 * The cookie format lives in `tests/support/console-cookie.ts`, which the e2e
 * session helper uses too, so the console's own sealing is reproduced in exactly
 * one place for tests. Read that file's header before changing anything about
 * it.
 *
 * What this produces is a *signed-in shell* and nothing more. The API tokens it
 * carries are placeholders, so any screen whose data comes from the API shows
 * the state it would show a real operator when the API is unreachable. With the
 * live adapter selected that is a coherent picture: the topbar tag reads
 * `offline` and the dashboard's reports say they could not be reached, which is
 * the same answer a real operator would get from a console pointed at an API
 * that is not running. Run the capture with `CRYDEN_MODE=live` for that; the
 * checkout's own default of `fixtures` would tag the health check as fixtures
 * while the dashboard still reported the API as unreachable, which is two
 * answers to one question.
 *
 * When there is no usable `CSAX_SESSION_SECRET`, the console shots are skipped
 * with a printed reason rather than failing the run: a fresh clone has no
 * secret, and a documentation script should not be the thing that stops
 * somebody reading the guide. That is the one way this differs from the e2e
 * helper, which throws instead, because an end-to-end test that silently did not
 * run would be worse than one that failed.
 */

/** The operator the screenshots show. A reserved domain, so it reads as sample data. */
export const SAMPLE_OPERATOR = {
  id: "9f1c0b7a-0000-4000-8000-000000000001",
  label: "operator@example.test",
  role: "admin",
} as const;

/** A name from the environment, then from `.env.local`. Undefined when neither has it. */
export function localSetting(name: string): string | undefined {
  const fromEnvironment = process.env[name];
  if (fromEnvironment !== undefined && fromEnvironment !== "") return fromEnvironment;

  try {
    const contents = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of contents.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;

      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;

      if (trimmed.slice(0, separator).trim() !== name) continue;

      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value === "" ? undefined : value;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** The cookie the browser context should present, or null when it cannot be minted. */
export async function mintSessionCookie(): Promise<{ name: string; value: string } | null> {
  if (sessionSecret() === null) return null;

  const value = await sealConsoleSession({
    sid: "screenshot-session",
    operator: SAMPLE_OPERATOR,
    // Fixed rather than random: a screenshot makes no mutation, and a constant
    // here means a regenerated image differs only where the console differs.
    csrf: "screenshot-csrf-value",
    // An hour, not the console's eight: a capture run is minutes, and a shorter
    // life is one less thing to wonder about if an old cookie is ever reused.
    ttlSeconds: 60 * 60,
  });

  return { name: SESSION_COOKIE, value };
}
