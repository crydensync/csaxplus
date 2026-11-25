import "server-only";

import { type Role } from "./roles";

/**
 * What the console reads out of an access token.
 *
 * The console holds no signing key and does not try to verify the signature:
 * `JWT_SECRET` belongs to the API, and §11.1 of the brief is explicit that the
 * console never holds the engine's credentials. It does not need to. Every token
 * here arrived over the console's own server-to-server call, is kept inside an
 * encrypted cookie the browser cannot write, and is presented back to the API
 * for every real call, where the API verifies it and refuses anything it is not
 * good for. So the API remains the authority on what a token may do, and these
 * claims are read only to decide which console screens to show.
 */

/** Role values returned by the API's operator store. */
export const API_ADMIN_ROLE = "admin";
export const API_OWNER_ROLE = "owner";

export type AccessTokenClaims = {
  userId: string;
  role: Role;
  /** Unix milliseconds. The token's own `exp`, not a configured guess. */
  expiresAt: number;
};

/**
 * The console's role for an operator, from the API's single `role` claim.
 *
 * The API operator store is the authority. Admin and owner claims may use the
 * admin read surface; only owner-specific BFF guards may manage operators.
 */
export function consoleRoleFromClaim(claim: unknown): Role {
  if (claim === API_OWNER_ROLE) return "owner";
  return claim === API_ADMIN_ROLE ? "admin" : "viewer";
}

/**
 * Reads a token's claims. Returns null when the token is not a JWT this
 * console can read, which is a failure in the API's answer rather than a
 * refusal of the caller: the caller sees a malformed-upstream error, not a
 * prompt to sign in again.
 */
export function decodeAccessToken(token: string): AccessTokenClaims | null {
  const parts = token.split(".");
  const encoded = parts[1];
  if (parts.length !== 3 || encoded === undefined) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const claims = parsed as Record<string, unknown>;

  const subject = claims.sub;
  if (typeof subject !== "string" || subject === "") return null;

  const exp = claims.exp;
  return {
    userId: subject,
    role: consoleRoleFromClaim(claims.role),
    // Every token the API issues carries `exp`. If one somehow does not, treat
    // it as already due for renewal rather than trusting it for an hour.
    expiresAt: typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : Date.now(),
  };
}
