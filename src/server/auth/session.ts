import "server-only";

import { z } from "zod";

import { getConfig } from "../config";
import { isRole, type Role } from "./roles";
import { openValue, sealValue } from "./sealed";

/**
 * The operator session, carried in one encrypted cookie.
 *
 * Encrypted rather than signed, because it holds the API's access and refresh
 * tokens: the browser must not be able to read them, and the console must not
 * hold them anywhere else. Nothing about the session lives in a server-side
 * table, so a restart does not sign anyone out and the cookie is the whole
 * state. See `sealed.ts` for how that is done.
 *
 * The refresh token is the sensitive part. It never leaves the server: route
 * handlers read the session, refresh when the access token is close to expiry,
 * and write an updated cookie back.
 */

export const SESSION_COOKIE = "csax_session";

/** The session cookie's audience, so no other sealed cookie can stand in for it. */
export const SESSION_AUDIENCE = "csaxplus.console";

/** How long the cookie lives. The API's own token expiry is shorter. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/**
 * Refresh this long before the access token expires, so a request that is
 * already in flight when the token turns over does not fail.
 */
export const REFRESH_LEEWAY_SECONDS = 60;

const operatorSchema = z.object({
  id: z.string().min(1),
  /** What to call this operator on screen: the address they signed in with. */
  label: z.string().min(1),
  role: z.string().refine(isRole, { message: "unknown console role" }),
});

const sessionSchema = z.object({
  /** Identifies this console session, for audit entries written by the console. */
  sid: z.string().min(1),
  /**
   * The API's own session id, once the console has learned it. `POST /v1/login`
   * does not return one, so it is resolved from the session list right after
   * signing in, and is null when that could not be done: signing out then
   * clears the console cookie without revoking the API's session. See
   * BACKEND_GAPS.md.
   */
  apiSessionId: z.string().min(1).nullable(),
  operator: operatorSchema,
  api: z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    /** Unix milliseconds at which the access token stops being valid. */
    expiresAt: z.number().int().positive(),
  }),
  /** Double-submit value for mutations. See csrf.ts. */
  csrf: z.string().min(1),
});

export type Session = z.infer<typeof sessionSchema>;
export type SessionOperator = z.infer<typeof operatorSchema>;

export async function sealSession(session: Session): Promise<string> {
  return sealValue(session, SESSION_AUDIENCE, SESSION_MAX_AGE_SECONDS);
}

/** Opens a session cookie. Null for anything this console did not mint. */
export async function openSession(cookie: string | undefined): Promise<Session | null> {
  return openValue(cookie, SESSION_AUDIENCE, sessionSchema);
}

/** True when the access token is expired, or close enough that it should be renewed. */
export function accessTokenNeedsRefresh(session: Session, now: number = Date.now()): boolean {
  return session.api.expiresAt - REFRESH_LEEWAY_SECONDS * 1000 <= now;
}

/** Replaces the API tokens while keeping the rest of the session as it was. */
export function withRefreshedTokens(
  session: Session,
  tokens: { accessToken: string; refreshToken: string; expiresAt: number },
): Session {
  return { ...session, api: tokens };
}

export type CookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
};

/**
 * Cookie flags. `Secure` is on in production and whenever the configured origin
 * is https; it is off for a plain-http development origin, because a browser
 * drops a Secure cookie it received over http and the developer would be signed
 * out on every request with no error to explain it. Recorded in DECISIONS.md.
 */
export function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function shouldUseSecureCookie(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return getConfig().webauthn.origin.startsWith("https://");
}

/** The role the session carries, already validated as one of the console's. */
export function sessionRole(session: Session): Role {
  const role = session.operator.role;
  if (!isRole(role)) {
    // openSession validates this, so reaching here means the two disagree.
    throw new Error("session carries a role the console does not know");
  }
  return role;
}
