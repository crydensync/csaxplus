import { readFileSync } from "node:fs";
import path from "node:path";

import { EncryptJWT } from "jose";

/**
 * Mints a session cookie for the screenshot run, so the console can be
 * photographed without a CrydenSync API to sign in against.
 *
 * This is the console's own cookie format, reproduced: `sealed.ts` writes an
 * `EncryptJWT` with `alg: dir`, `enc: A256GCM`, issuer `csaxplus`, audience
 * `csaxplus.console`, keyed by `CSAX_SESSION_SECRET`. The key is read from the
 * checkout's gitignored `.env.local`, never written down here and never
 * printed.
 *
 * What it produces is a *signed-in shell* and nothing more. The API tokens it
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
 * When `.env.local` has no `CSAX_SESSION_SECRET`, the console shots are skipped
 * with a printed reason rather than failing the run: a fresh clone has no
 * secret, and a documentation script should not be the thing that stops
 * somebody reading the guide.
 */

export const SESSION_COOKIE = "csax_session";

/** The operator the screenshots show. A reserved domain, so it reads as sample data. */
export const SAMPLE_OPERATOR = {
  id: "9f1c0b7a-0000-4000-8000-000000000001",
  label: "operator@example.test",
  role: "admin",
} as const;

function parseEnvFile(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const name = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (name !== "") values.set(name, value);
  }
  return values;
}

/** A name from the environment, then from `.env.local`. Undefined when neither has it. */
export function localSetting(name: string): string | undefined {
  const fromEnvironment = process.env[name];
  if (fromEnvironment !== undefined && fromEnvironment !== "") return fromEnvironment;

  try {
    const file = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    const value = parseEnvFile(file).get(name);
    return value === undefined || value === "" ? undefined : value;
  } catch {
    return undefined;
  }
}

/** The cookie the browser context should present, or null when it cannot be minted. */
export async function mintSessionCookie(): Promise<{ name: string; value: string } | null> {
  const secret = localSetting("CSAX_SESSION_SECRET");
  if (secret === undefined) return null;

  let key: Buffer;
  try {
    key = Buffer.from(secret, "base64");
  } catch {
    return null;
  }
  if (key.length !== 32) return null;

  const session = {
    sid: "screenshot-session",
    // `POST /v1/login` does not return the session it created, so the console
    // records null when it could not read the list. See BACKEND_GAPS 4.1.
    apiSessionId: null,
    operator: SAMPLE_OPERATOR,
    api: {
      accessToken: "placeholder-not-a-token",
      refreshToken: "placeholder-not-a-token",
      expiresAt: Date.now() + 60 * 60 * 1000,
    },
    csrf: "screenshot-csrf-value",
  };

  const value = await new EncryptJWT({ value: session })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer("csaxplus")
    .setAudience("csaxplus.console")
    .setIssuedAt()
    .setExpirationTime("1h")
    .encrypt(key);

  return { name: SESSION_COOKIE, value };
}
