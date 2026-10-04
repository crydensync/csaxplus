import "server-only";

import { z } from "zod";

import { SECOND_FACTOR_METHODS, type PausedLogin } from "./api-auth";
import { type CookieAttributes } from "./cookies";
import { openValue, sealValue } from "./sealed";

/**
 * A login that stopped at the second factor, held between the two requests.
 *
 * The API answers a correct password with a `pending_token` that proves the
 * first factor and nothing else: it is not an access token and works on no other
 * endpoint. It is short-lived (the engine allows five minutes) and the browser
 * has to carry it from the password step to the code step.
 *
 * It is carried in its own encrypted cookie rather than handed to the page, so
 * it stays as unreadable to a script as the session is. The address the operator
 * typed is kept beside it, so the second step can say whose login it is
 * completing without asking again.
 */

export const PENDING_COOKIE = "csax_pending";

/** Matches the engine's own five minute limit on a pending login. */
export const PENDING_MAX_AGE_SECONDS = 5 * 60;

/** Its own audience: a paused login can never be presented as a session. */
export const PENDING_AUDIENCE = "csaxplus.pending";

const pendingSchema = z.object({
  pendingToken: z.string().min(1),
  methods: z.array(z.enum(SECOND_FACTOR_METHODS)),
  /** The address the operator signed in with, echoed on the second step. */
  email: z.string().min(1),
  /**
   * Set once a passkey ceremony has started, and read back by the finish step.
   * The API issues it with the challenge and requires it with the answer; like
   * the pending token, the browser never needs to see it.
   */
  ceremonyToken: z.string().min(1).nullable(),
});

export type PendingLogin = z.infer<typeof pendingSchema>;

/** Begins a pause. The ceremony token is set later, if a passkey is used. */
export function startPending(paused: PausedLogin, email: string): PendingLogin {
  return { ...paused, email, ceremonyToken: null };
}

export function withCeremonyToken(pending: PendingLogin, ceremonyToken: string): PendingLogin {
  return { ...pending, ceremonyToken };
}

export async function sealPendingLogin(pending: PendingLogin): Promise<string> {
  return sealValue(pending, PENDING_AUDIENCE, PENDING_MAX_AGE_SECONDS);
}

export async function openPendingLogin(cookie: string | undefined): Promise<PendingLogin | null> {
  return openValue(cookie, PENDING_AUDIENCE, pendingSchema);
}

export function pendingCookieOptions(secure: boolean): CookieAttributes {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: PENDING_MAX_AGE_SECONDS,
  };
}
