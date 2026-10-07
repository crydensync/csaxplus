import "server-only";

import { randomBytes } from "node:crypto";

import { CrydenError } from "../cryden/http";
import {
  beginPasskey,
  completeRecoveryCode,
  completeTotp,
  finishPasskey,
  listSessions,
  refreshTokens,
  revokeSession,
  signInWithPassword,
  type ApiTokens,
  type PausedLogin,
} from "./api-auth";
import { decodeAccessToken } from "./claims";
import { createCsrfToken } from "./csrf";
import { type PendingLogin } from "./pending";
import { withRefreshedTokens, type Session } from "./session";

/**
 * What happens between the sign-in form and a session cookie.
 *
 * The API's two-step login and its rotating refresh tokens are turned into one
 * thing here, so every caller deals in either a `Session` or a paused login, and
 * nothing above this module handles a token directly.
 *
 * `PausedLogin` is what the API answered with (a pending token and the methods
 * it will accept); `PendingLogin` is that plus the address the operator typed,
 * which is what the sealed cookie carries between the two steps.
 */

export type SignInOutcome =
  { kind: "session"; session: Session } | { kind: "second-factor"; paused: PausedLogin };

export type Renewal = { kind: "session"; session: Session } | { kind: "expired" };

/** A console session identifier, for audit entries the console itself writes. */
function newSessionId(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * The API session that was just created.
 *
 * `POST /v1/login` returns tokens and no session id, but signing out needs one:
 * `POST /v1/logout` takes a `session_id` and refuses one that is not yours. So
 * the console asks for the account's session list and takes the newest, which is
 * the one this sign-in just made. Recorded in BACKEND_GAPS.md as a field the
 * login response should carry.
 *
 * A failure here is not a failure to sign in. It costs the ability to revoke the
 * API-side session at sign-out, which the session records as null and the
 * sign-out result reports, rather than refusing a login that otherwise worked.
 */
async function newestApiSessionId(accessToken: string): Promise<string | null> {
  try {
    const sessions = await listSessions(accessToken);
    let newest: { id: string; at: number } | null = null;
    for (const session of sessions) {
      const at = Date.parse(session.createdAt);
      if (Number.isNaN(at)) continue;
      if (newest === null || at > newest.at) newest = { id: session.id, at };
    }
    return newest?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Turns a fresh pair of API tokens into a console session.
 *
 * The access token identifies the operator: its `sub` is the user id and its
 * `role` decides the console role. A token this console cannot read is a failure
 * of the API's answer, not a refusal of the operator, so it is raised rather
 * than turned into a signed-out state.
 */
export async function sessionFromTokens(tokens: ApiTokens, label: string): Promise<Session> {
  const claims = decodeAccessToken(tokens.accessToken);
  if (claims === null) {
    throw new CrydenError("malformed", "the API issued an access token this console cannot read");
  }

  return {
    sid: newSessionId(),
    apiSessionId: await newestApiSessionId(tokens.accessToken),
    operator: { id: claims.userId, label, role: claims.role },
    api: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: claims.expiresAt,
    },
    csrf: createCsrfToken(),
  };
}

/** `POST /v1/login`, and whatever the API's answer turns into. */
export async function signIn(email: string, password: string): Promise<SignInOutcome> {
  const result = await signInWithPassword(email, password);
  if (result.kind === "second-factor") {
    return { kind: "second-factor", paused: result.paused };
  }
  return { kind: "session", session: await sessionFromTokens(result.tokens, email) };
}

export async function sessionFromTotp(pending: PendingLogin, code: string): Promise<Session> {
  return sessionFromTokens(await completeTotp(pending.pendingToken, code), pending.email);
}

export async function sessionFromRecoveryCode(
  pending: PendingLogin,
  code: string,
): Promise<Session> {
  return sessionFromTokens(await completeRecoveryCode(pending.pendingToken, code), pending.email);
}

/**
 * Starts the passkey ceremony. The challenge goes to the browser, which signs it
 * with the credential the operator already has registered. The ceremony token
 * that comes back is held in the sealed pending cookie, not sent to the page.
 */
export async function beginPasskeyStep(paused: PendingLogin) {
  return beginPasskey(paused.pendingToken);
}

export async function sessionFromPasskey(
  pending: PendingLogin,
  ceremonyToken: string,
  credential: unknown,
): Promise<Session> {
  return sessionFromTokens(
    await finishPasskey(pending.pendingToken, ceremonyToken, credential),
    pending.email,
  );
}

/**
 * Exchanges the session's refresh token for a new pair.
 *
 * The API rotates on every refresh and revokes the token it was given, so the
 * caller must store the new one. Two answers mean the session is over rather
 * than the call having failed: `invalid_token` for a token the API does not
 * know, and `token_reused` for one that was already rotated, which the API
 * answers by revoking the whole chain. Either way the only safe reading is to
 * sign in again. Anything else, a network failure above all, is raised, because
 * signing an operator out over a blip would be the wrong answer.
 */
export async function renewSession(session: Session): Promise<Renewal> {
  let tokens: ApiTokens;
  try {
    tokens = await refreshTokens(session.api.refreshToken);
  } catch (error) {
    if (
      error instanceof CrydenError &&
      (error.code === "token_reused" || error.code === "invalid_token")
    ) {
      return { kind: "expired" };
    }
    throw error;
  }

  const claims = decodeAccessToken(tokens.accessToken);
  if (claims === null) {
    throw new CrydenError("malformed", "the API issued an access token this console cannot read");
  }

  return {
    kind: "session",
    session: withRefreshedTokens(session, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: claims.expiresAt,
    }),
  };
}

/**
 * Ends the session, at the API as well as in the browser.
 *
 * Revoking is best effort: an API that cannot be reached must not leave the
 * operator still signed in to the console, so the cookie is cleared either way
 * and the caller is told whether the API-side session was actually revoked.
 * That distinction is reported rather than hidden, because a refresh token that
 * outlives the browser session is worth knowing about.
 */
export async function signOut(session: Session): Promise<{ revoked: boolean }> {
  if (session.apiSessionId === null) return { revoked: false };

  try {
    await revokeSession(session.apiSessionId, session.api.accessToken);
    return { revoked: true };
  } catch {
    return { revoked: false };
  }
}
