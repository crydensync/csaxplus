import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { EncryptJWT } from "jose";

/**
 * The console's session cookie, reproduced for tests that need to be signed in.
 *
 * The console's session is one encrypted cookie and nothing else: there is no
 * server-side session table, so a test that can mint that cookie is signed in as
 * far as every route and every server component is concerned. Two suites need
 * exactly that, for the same reason: neither can reach the sign-in screen, which
 * needs a CrydenSync API behind it.
 *
 * - `tests/e2e/console-session.ts`, for the tests that drive a signed-in screen.
 * - `tests/screenshots/capture.spec.ts`, which photographs one.
 *
 * It could not import the console's own sealing code: `src/server/auth/sealed.ts`
 * begins with `import "server-only"`, which throws outside a React server
 * runtime. So the format is repeated here, and this file exists so that it is
 * repeated **once**. That is the thing to remember about it: a change to the
 * sealed-cookie format has to be made in two places, here and in `sealed.ts`,
 * and the symptom of forgetting is a test that lands on `/login` with no other
 * clue as to why.
 *
 * What matters and must match: the protected header (`dir` / `A256GCM`), the
 * issuer, the audience, and the `{ value }` envelope around the payload.
 */

/** Mirrors `SESSION_COOKIE`. */
export const SESSION_COOKIE = "csax_session";

/** Mirrors `SEALED_ISSUER`. */
const SEALED_ISSUER = "csaxplus";

/** Mirrors `SESSION_AUDIENCE`. */
const SESSION_AUDIENCE = "csaxplus.console";

/** Mirrors `SESSION_MAX_AGE_SECONDS`. */
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** Where the repository's own `.env` files live, from this file's location. */
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

/**
 * One value from the environment, resolved the way Next resolves it.
 *
 * The order is Next's own: a variable already in the process wins, then the
 * environment-specific local file, then the plain local file, then the
 * environment-specific file, then the plain one. Anything else would let a test
 * read a value the server is not using, and the failure that produces is a
 * session the console refuses with nothing on screen to explain it.
 */
export function consoleEnv(name: string): string | undefined {
  const fromProcess = process.env[name];
  if (fromProcess !== undefined && fromProcess !== "") return fromProcess;

  const nodeEnv = process.env.NODE_ENV ?? "development";
  const candidates = [`.env.${nodeEnv}.local`, ".env.local", `.env.${nodeEnv}`, ".env"];

  for (const candidate of candidates) {
    const file = path.join(REPO_ROOT, candidate);
    if (!existsSync(file)) continue;
    const found = parseEnvFile(readFileSync(file, "utf8")).get(name);
    if (found !== undefined && found !== "") return found;
  }
  return undefined;
}

/**
 * A minimal `.env` reader.
 *
 * Only what these files contain: `KEY=value`, blank lines, `#` comments, and
 * values that may be quoted. It does not expand variables and does not handle
 * multi-line values, and it does not need to.
 */
export function parseEnvFile(contents: string): Map<string, string> {
  const values = new Map<string, string>();

  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    if (key === "") continue;

    let value = line.slice(separator + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length > 1) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

/**
 * The key the console seals a session with, or null when this checkout has none.
 *
 * Base64 in the environment and bytes by the time it reaches `jose`, which is
 * the same conversion `src/server/config/index.ts` makes. A key of the wrong
 * length is refused outright rather than producing a cookie that fails
 * mysteriously later, and `A256GCM` is what fixes the length at 32 bytes.
 */
export function sessionSecret(): Uint8Array | null {
  const encoded = consoleEnv("CSAX_SESSION_SECRET");
  if (encoded === undefined) return null;

  const secret = new Uint8Array(Buffer.from(encoded, "base64"));
  return secret.length === 32 ? secret : null;
}

/** What a minted session says. The caller decides who the operator is. */
export type MintedSession = {
  sid: string;
  operator: { id: string; label: string; role: string };
  csrf: string;
  /** How long the cookie lives. Defaults to the console's own eight hours. */
  ttlSeconds?: number;
};

/**
 * Seals one session into a cookie value.
 *
 * The API tokens are placeholders, and that is deliberate rather than a
 * shortcut: a session whose access token has hours left is never renewed, so
 * `requireSession` finds nothing to refresh and never reaches for an API that a
 * test does not have. A test that wants the renewal path would have to give the
 * session an expiring token, and would need the API behind it.
 */
export async function sealConsoleSession(session: MintedSession): Promise<string> {
  const secret = sessionSecret();
  if (secret === null) {
    throw new Error(
      "No usable CSAX_SESSION_SECRET, so a console session cannot be minted. The tests read " +
        "it from .env and .env.local, the same files `next dev` reads, and it has to decode " +
        "to 32 base64 bytes for A256GCM. See .env.example, or generate one with: " +
        "openssl rand -base64 32",
    );
  }

  const ttl = session.ttlSeconds ?? SESSION_MAX_AGE_SECONDS;
  return new EncryptJWT({
    value: {
      sid: session.sid,
      // `POST /v1/login` does not return the session it created, so the console
      // records null when it could not read the list. See BACKEND_GAPS 4.1.
      apiSessionId: null,
      operator: session.operator,
      api: {
        accessToken: "test-placeholder-not-a-token",
        refreshToken: "test-placeholder-not-a-token",
        expiresAt: Date.now() + ttl * 1000,
      },
      csrf: session.csrf,
    },
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer(SEALED_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .encrypt(secret);
}

/** The console's own maximum life, for a caller that wants to name it. */
export const CONSOLE_SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_SECONDS;
