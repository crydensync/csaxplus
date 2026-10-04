import "server-only";

import { headers } from "next/headers";

import { getConfig } from "../config";
import { checkOrigin, csrfTokensMatch, CSRF_HEADER } from "./csrf";
import { clearCookie, parseCookieHeader, serializeCookie } from "./cookies";
import { responseForFailure } from "./failures";
import { renewSession } from "./flow";
import { ERROR_CODES, jsonError } from "./response";
import { isAdmin, mayMutate, mayReachSecrets, type Role } from "./roles";
import {
  SESSION_COOKIE,
  accessTokenNeedsRefresh,
  openSession,
  sealSession,
  sessionCookieOptions,
  sessionRole,
  shouldUseSecureCookie,
  type Session,
} from "./session";

/**
 * Guards for the console's own endpoints. Every route handler starts with one
 * of these, so a rule enforced here holds for the whole surface rather than
 * being remembered screen by screen.
 *
 * A guard returns a result rather than throwing, because the two outcomes need
 * different things: a handler either gets a session to work with, or a Response
 * to return unchanged.
 *
 * Renewal happens here too. The API's access token lives fifteen minutes and the
 * console's cookie eight hours, so a handler that only read the session would
 * sign an operator out every fifteen minutes. When the access token is close to
 * expiry this exchanges the refresh token for a new pair, and hands back the
 * `Set-Cookie` that has to travel with the answer. `respond` attaches it, and
 * the handlers return their answers through it precisely so that it cannot be
 * forgotten: a refresh that is not written back has already rotated and revoked
 * the token the console is still holding, and the next call would fail.
 */

export type Authorized =
  | {
      ok: true;
      session: Session;
      role: Role;
      /** Set-Cookie values to attach to whatever answer the handler returns. */
      setCookies: string[];
      /** Returns the answer with those values attached. */
      respond: (response: Response) => Response;
    }
  | { ok: false; response: Response };

/** Adds Set-Cookie values to an already-built answer. */
export function withSetCookies(response: Response, cookies: readonly string[]): Response {
  if (cookies.length === 0) return response;

  const merged = new Headers(response.headers);
  for (const cookie of cookies) merged.append("set-cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}

export function sessionFromCookieHeader(header: string | null | undefined): Promise<Session | null> {
  return openSession(parseCookieHeader(header).get(SESSION_COOKIE));
}

export function sessionFromRequest(request: Request): Promise<Session | null> {
  return sessionFromCookieHeader(request.headers.get("cookie"));
}

/**
 * The session for a server component. Reading only: a component cannot set a
 * cookie, so an access token close to expiry is left for the first call the
 * screen makes through a route handler, which renews it.
 */
export async function readSession(): Promise<Session | null> {
  return sessionFromCookieHeader((await headers()).get("cookie"));
}

function granted(session: Session, setCookies: string[]): Authorized {
  return {
    ok: true,
    session,
    role: sessionRole(session),
    setCookies,
    respond: (response) => withSetCookies(response, setCookies),
  };
}

/**
 * Requires a signed-in operator, renewing the API tokens if they are nearly
 * done.
 *
 * A cookie that was presented but cannot be read is cleared on the way out, so
 * a browser stops sending one this console will never accept. A refresh that
 * could not be attempted is not a signed-out operator: the API being
 * unreachable is reported as itself, and the cookie is left alone.
 */
export async function requireSession(request: Request): Promise<Authorized> {
  const presented = parseCookieHeader(request.headers.get("cookie")).get(SESSION_COOKIE);
  const session = await openSession(presented);
  const options = sessionCookieOptions(shouldUseSecureCookie());

  if (session === null) {
    const response = jsonError(401, ERROR_CODES.unauthenticated, "Sign in to continue.");
    if (presented === undefined) return { ok: false, response };
    return { ok: false, response: withSetCookies(response, [clearCookie(SESSION_COOKIE, options)]) };
  }

  if (!accessTokenNeedsRefresh(session)) return granted(session, []);

  let renewal;
  try {
    renewal = await renewSession(session);
  } catch (error) {
    return { ok: false, response: responseForFailure(error) };
  }

  if (renewal.kind === "expired") {
    return {
      ok: false,
      response: withSetCookies(
        jsonError(401, ERROR_CODES.unauthenticated, "Your session has ended. Sign in again."),
        [clearCookie(SESSION_COOKIE, options)],
      ),
    };
  }

  return granted(renewal.session, [
    serializeCookie(SESSION_COOKIE, await sealSession(renewal.session), options),
  ]);
}

/**
 * Refuses a request that did not come from the console's own origin.
 *
 * Used on its own by the routes that run before there is a session, so that a
 * sign-in cannot be driven from another site: a cross-site form post carries an
 * Origin this refuses. A request with neither Origin nor Host is not a browser,
 * and is left to the session and CSRF checks that follow.
 */
export function requireSameOrigin(request: Request): Response | null {
  const verdict = checkOrigin(
    request.headers.get("origin"),
    getConfig().webauthn.origin,
    request.headers.get("host"),
  );
  if (verdict === "mismatch") {
    return jsonError(403, ERROR_CODES.csrf, "That request did not come from the console.");
  }
  return null;
}

/**
 * Origin and CSRF, on a session that is already in hand. Both checks, in that
 * order: a request that did not come from the console is refused before its
 * token is looked at.
 */
async function csrfOn(authorized: Extract<Authorized, { ok: true }>, request: Request) {
  const originFailure = requireSameOrigin(request);
  if (originFailure !== null) {
    return { ok: false, response: authorized.respond(originFailure) } as const;
  }

  const presented = request.headers.get(CSRF_HEADER);
  if (!csrfTokensMatch(authorized.session.csrf, presented)) {
    return {
      ok: false,
      response: authorized.respond(
        jsonError(403, ERROR_CODES.csrf, "Your session token is missing or stale."),
      ),
    } as const;
  }

  return authorized;
}

/**
 * Requires a signed-in operator whose role may change something.
 *
 * The order matters: the session first, so an anonymous request is told to sign
 * in rather than being told about a token it cannot have. Every refusal still
 * carries any renewed cookie, for the reason in this module's header.
 */
export async function requireMutation(request: Request): Promise<Authorized> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized;

  if (!mayMutate(authorized.role)) {
    return {
      ok: false,
      response: authorized.respond(
        jsonError(403, ERROR_CODES.forbidden, "Your role can read, not change."),
      ),
    };
  }

  return csrfOn(authorized, request);
}

/**
 * Origin and CSRF only, for a change every signed-in role may make. Signing out
 * is the one that exists so far: a viewer is read-only, not trapped.
 */
export async function requireCsrf(request: Request): Promise<Authorized> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized;
  return csrfOn(authorized, request);
}

/** Requires a role that may see secret material. Used by the vault screens. */
export async function requireSecretsAccess(request: Request): Promise<Authorized> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized;

  if (!mayReachSecrets(authorized.role)) {
    return {
      ok: false,
      response: authorized.respond(
        jsonError(403, ERROR_CODES.forbidden, "Your role cannot reach secrets."),
      ),
    };
  }
  return authorized;
}

/**
 * Requires the role the API only grants admins. Used by the screens that act on
 * other operators, which the API itself refuses for anyone else.
 */
export async function requireAdmin(request: Request): Promise<Authorized> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized;

  if (!isAdmin(authorized.role)) {
    return {
      ok: false,
      response: authorized.respond(
        jsonError(403, ERROR_CODES.forbidden, "Your role cannot do this."),
      ),
    };
  }
  return authorized;
}
