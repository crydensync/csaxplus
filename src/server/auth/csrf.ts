import { timingSafeEqual } from "node:crypto";

import { CSRF_HEADER } from "@/lib/csrf-header";

/**
 * CSRF defence for the console's own mutation endpoints.
 *
 * Two independent checks, both required on every non-GET route:
 *
 * 1. A double-submit token. A random value is minted with the session, sealed
 *    inside the encrypted cookie, and required back in the `x-csrf-token`
 *    header. An attacker who can make a browser send the cookie cannot read
 *    that header value, because the cookie is httpOnly.
 * 2. An origin check. The `Origin` header must be the console's own origin.
 *
 * Neither replaces the other. SameSite=Lax on the session cookie already stops
 * a cross-site POST from carrying it, but that is one browser behaviour away
 * from being the only defence, and this is cheap.
 */

/**
 * Header the browser must echo the session's CSRF value in.
 *
 * Defined in `src/lib/csrf-header.ts`, which the browser half of the console
 * imports too, so the name the server reads and the name the client writes are
 * the same string rather than two that agree by convention.
 */
export { CSRF_HEADER };

const TOKEN_BYTES = 32;

export function createCsrfToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** Compares two tokens without leaking their contents through timing. */
export function csrfTokensMatch(expected: string, received: string | null): boolean {
  if (received === null) return false;

  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(received);
  // timingSafeEqual requires equal lengths, and the length of a token is not
  // the secret part, so comparing it first leaks nothing.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type OriginVerdict = "ok" | "missing" | "mismatch";

/**
 * Checks the request's Origin. A browser sends it on every non-GET request, so
 * its absence means the caller is not a browser and the header check is not the
 * defence that matters for them; the session cookie is.
 */
export function checkOrigin(
  origin: string | null,
  expected: string,
  host: string | null,
): OriginVerdict {
  if (origin !== null) {
    return normalise(origin) === normalise(expected) ? "ok" : "mismatch";
  }

  // No Origin at all: not a browser, so this check is not the one protecting
  // the caller. Fall back to Host, which a cross-site attacker cannot forge,
  // and let the session cookie and the CSRF token do the real work.
  if (host === null) return "missing";
  return host.toLowerCase() === new URL(expected).host.toLowerCase() ? "ok" : "mismatch";
}

function normalise(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}
