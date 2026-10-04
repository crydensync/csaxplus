import "server-only";

import { cookies } from "next/headers";

import { getConfig } from "../config";
import { checkOrigin, csrfTokensMatch, CSRF_HEADER } from "./csrf";
import { ERROR_CODES, jsonError } from "./response";
import { isAdmin, mayMutate, mayReachSecrets, type Role } from "./roles";
import {
  SESSION_COOKIE,
  openSession,
  sealSession,
  sessionCookieOptions,
  sessionRole,
  shouldUseSecureCookie,
  type Session,
} from "./session";

/**
 * Guards for the console's BFF endpoints. Every route handler starts with one
 * of these, so a rule enforced here holds for the whole surface rather than
 * being remembered screen by screen.
 *
 * A guard returns a result rather than throwing, because the two outcomes need
 * different things: a handler either gets a session to work with, or a Response
 * to return unchanged.
 */

export type Guarded =
  { ok: true; session: Session; role: Role } | { ok: false; response: Response };

/** The session from the request cookie, with no checks beyond it decrypting. */
export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  return openSession(jar.get(SESSION_COOKIE)?.value);
}

/** Requires a signed-in operator. */
export async function requireSession(): Promise<Guarded> {
  const session = await readSession();
  if (session === null) {
    return {
      ok: false,
      response: jsonError(401, ERROR_CODES.unauthenticated, "Sign in to continue."),
    };
  }
  return { ok: true, session, role: sessionRole(session) };
}

/**
 * Requires a signed-in operator whose role may change something, and whose
 * request carries the session's CSRF token from the console's own origin.
 *
 * The order matters: the session first, so an anonymous request is told to sign
 * in rather than being told about a token it cannot have.
 */
export async function requireMutation(request: Request): Promise<Guarded> {
  const guarded = await requireSession();
  if (!guarded.ok) return guarded;

  if (!mayMutate(guarded.role)) {
    return {
      ok: false,
      response: jsonError(403, ERROR_CODES.forbidden, "Your role is read-only."),
    };
  }

  const verdict = checkOrigin(
    request.headers.get("origin"),
    getConfig().webauthn.origin,
    request.headers.get("host"),
  );
  if (verdict === "mismatch") {
    return {
      ok: false,
      response: jsonError(403, ERROR_CODES.csrf, "That request did not come from the console."),
    };
  }

  const presented = request.headers.get(CSRF_HEADER);
  if (!csrfTokensMatch(guarded.session.csrf, presented)) {
    return {
      ok: false,
      response: jsonError(403, ERROR_CODES.csrf, "Your session token is missing or stale."),
    };
  }

  return guarded;
}

/** Requires a role that may see secret material. Used by the vault screens. */
export async function requireSecretsAccess(): Promise<Guarded> {
  const guarded = await requireSession();
  if (!guarded.ok) return guarded;

  if (!mayReachSecrets(guarded.role)) {
    return {
      ok: false,
      response: jsonError(403, ERROR_CODES.forbidden, "Your role cannot reach secrets."),
    };
  }
  return guarded;
}

/**
 * Requires the role the API only grants admins. Used by the screens that act on
 * other operators, which the API itself refuses for anyone else.
 */
export async function requireAdmin(): Promise<Guarded> {
  const guarded = await requireSession();
  if (!guarded.ok) return guarded;

  if (!isAdmin(guarded.role)) {
    return {
      ok: false,
      response: jsonError(403, ERROR_CODES.forbidden, "Your role cannot do this."),
    };
  }
  return guarded;
}

/** Writes the session cookie. Only valid in a route handler or a server action. */
export async function writeSessionCookie(session: Session): Promise<void> {
  const jar = await cookies();
  jar.set(
    SESSION_COOKIE,
    await sealSession(session),
    sessionCookieOptions(shouldUseSecureCookie()),
  );
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(shouldUseSecureCookie()),
    maxAge: 0,
  });
}
