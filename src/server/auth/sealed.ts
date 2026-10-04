import "server-only";

import { EncryptJWT, jwtDecrypt } from "jose";
import type { z } from "zod";

import { getConfig } from "../config";

/**
 * A value carried in one encrypted cookie.
 *
 * Encrypted rather than signed, because what travels here is never meant to be
 * read by the browser: the operator session holds the API's access and refresh
 * tokens, and a paused login holds the token that proves a first factor. Both
 * live server-side; the cookie is the only place either is written down, and a
 * page script cannot read it. The payload is authenticated as well as hidden, so
 * a tampered cookie fails to decrypt rather than decrypting into something else.
 *
 * The audience separates the two uses, so a paused-login cookie can never be
 * presented as a session cookie even though both are sealed with the same key.
 */

export const SEALED_ISSUER = "csaxplus";

export async function sealValue(
  value: unknown,
  audience: string,
  maxAgeSeconds: number,
): Promise<string> {
  return new EncryptJWT({ value })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer(SEALED_ISSUER)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .encrypt(getConfig().session.secret);
}

/**
 * Opens a sealed cookie. Returns null for anything this console did not mint: a
 * wrong key, a tampered payload, an expired cookie, another audience, or a value
 * whose shape has changed since it was written. Expiry is enforced by `jose`
 * against the JWT's own `exp`, and the payload is re-parsed with the caller's
 * schema, so a cookie from an older version cannot smuggle in a field the
 * console would act on.
 */
export async function openValue<T>(
  cookie: string | undefined,
  audience: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  if (cookie === undefined || cookie === "") return null;

  let payload: unknown;
  try {
    const result = await jwtDecrypt(cookie, getConfig().session.secret, {
      issuer: SEALED_ISSUER,
      audience,
    });
    payload = result.payload.value;
  } catch {
    return null;
  }

  const parsed = schema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}
