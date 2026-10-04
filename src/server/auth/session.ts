import "server-only";

import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";

import { getConfig } from "../config";
import { isRole, type Role } from "./roles";

/**
 * The operator session, carried in one encrypted cookie.
 *
 * Encrypted rather than signed, because it holds the API's access and refresh
 * tokens: the browser must not be able to read them, and the console must not
 * hold them anywhere else. Nothing about the session lives in a server-side
 * table, so a restart does not sign anyone out and the cookie is the whole
 * state. What is in it is authenticated as well as hidden, so a tampered cookie
 * fails to decrypt rather than decrypting into something else.
 *
 * The refresh token is the sensitive part. It never leaves the server: route
 * handlers read the session, refresh when the access token is close to expiry,
 * and write an updated cookie back.
 */

export const SESSION_COOKIE = "csax_session";

/** How long the cookie lives. The API's own token expiry can be shorter. */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/**
 * Refresh this long before the access token expires, so a request that is
 * already in flight when the token turns over does not fail.
 */
export const REFRESH_LEEWAY_SECONDS = 60;

const operatorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  role: z.string().refine(isRole, { message: "unknown console role" }),
});

const sessionSchema = z.object({
  /** Identifies this cookie to the API's session list and to step-up grants. */
  sid: z.string().min(1),
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

export const SESSION_ISSUER = "csaxplus";
export const SESSION_AUDIENCE = "csaxplus.console";

function key(): Uint8Array {
  return getConfig().session.secret;
}

export async function sealSession(session: Session): Promise<string> {
  return new EncryptJWT({ session })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .encrypt(key());
}

/**
 * Opens a cookie value. Returns null for anything that is not a session this
 * console minted: a wrong key, a tampered payload, an expired cookie or a value
 * whose shape has changed since it was written. Expiry is enforced by `jose`
 * against the JWT's own `exp`, and the payload is re-parsed with zod, so a
 * cookie from an older version cannot smuggle in a field the console would act
 * on.
 */
export async function openSession(cookie: string | undefined): Promise<Session | null> {
  if (cookie === undefined || cookie === "") return null;

  let payload: unknown;
  try {
    const result = await jwtDecrypt(cookie, key(), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    payload = result.payload.session;
  } catch {
    return null;
  }

  const parsed = sessionSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
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
