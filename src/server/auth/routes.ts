import "server-only";

import { type z } from "zod";

import { clearCookie, parseCookieHeader, serializeCookie } from "./cookies";
import { PENDING_COOKIE, openPendingLogin, pendingCookieOptions, sealPendingLogin, type PendingLogin } from "./pending";
import { ERROR_CODES, jsonError } from "./response";
import {
  SESSION_COOKIE,
  sealSession,
  sessionCookieOptions,
  shouldUseSecureCookie,
  type Session,
} from "./session";

/**
 * The plumbing every auth route handler shares: reading a body, and building the
 * one `Set-Cookie` value a step needs. Each returns a finished string, so a
 * handler can attach it to whichever response it ends up returning, including a
 * refusal.
 */

/**
 * The largest body any handler here will read. All of them take a handful of
 * short fields; the limit is here so that a password or a code cannot be turned
 * into megabytes of work before anything looks at it.
 */
export const MAX_BODY_BYTES = 64 * 1024;

export type BodyResult<T> = { ok: true; value: T } | { ok: false; response: Response };

/**
 * Reads a JSON body and checks its shape.
 *
 * A refusal names the fields that were wrong and never what was in them: the
 * bodies here carry passwords, codes and tokens, and none of those may end up in
 * an answer, a log line or an error page.
 */
export async function readJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<BodyResult<T>> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    return { ok: false, response: tooLarge() };
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return {
      ok: false,
      response: jsonError(400, ERROR_CODES.invalidRequest, "Send this request as JSON."),
    };
  }
  if (raw.length > MAX_BODY_BYTES) return { ok: false, response: tooLarge() };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      response: jsonError(400, ERROR_CODES.invalidRequest, "Send this request as JSON."),
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const fields = [
      ...new Set(
        result.error.issues.map((issue) => issue.path.join(".")).filter((path) => path !== ""),
      ),
    ];
    return {
      ok: false,
      response: jsonError(
        400,
        ERROR_CODES.invalidRequest,
        fields.length === 0
          ? "That request was not in the expected shape."
          : `Check these fields: ${fields.join(", ")}.`,
      ),
    };
  }

  return { ok: true, value: result.data };
}

function tooLarge(): Response {
  return jsonError(413, ERROR_CODES.payloadTooLarge, "That request was larger than this endpoint accepts.");
}

/** What the browser is told about the signed-in operator. Never a token. */
export function sessionSummary(session: Session) {
  return {
    operator: {
      id: session.operator.id,
      label: session.operator.label,
      role: session.operator.role,
    },
  };
}

/** The paused login this request is completing, if it still has one. */
export async function pendingFromRequest(request: Request): Promise<PendingLogin | null> {
  return openPendingLogin(parseCookieHeader(request.headers.get("cookie")).get(PENDING_COOKIE));
}

/** The session cookie for a newly signed-in operator. */
export async function sessionSetCookie(session: Session): Promise<string> {
  const options = sessionCookieOptions(shouldUseSecureCookie());
  return serializeCookie(SESSION_COOKIE, await sealSession(session), options);
}

export function clearedSessionSetCookie(): string {
  return clearCookie(SESSION_COOKIE, sessionCookieOptions(shouldUseSecureCookie()));
}

/** The cookie that carries a paused login between its two steps. */
export async function pendingSetCookie(pending: PendingLogin): Promise<string> {
  return serializeCookie(
    PENDING_COOKIE,
    await sealPendingLogin(pending),
    pendingCookieOptions(shouldUseSecureCookie()),
  );
}

export function clearedPendingSetCookie(): string {
  return clearCookie(PENDING_COOKIE, pendingCookieOptions(shouldUseSecureCookie()));
}
