import { z } from "zod";

import { responseForFailure } from "@/server/auth/failures";
import { sessionFromTotp } from "@/server/auth/flow";
import { requireSameOrigin, withSetCookies } from "@/server/auth/guard";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import {
  clearedPendingSetCookie,
  pendingFromRequest,
  readJsonBody,
  sessionSetCookie,
  sessionSummary,
} from "@/server/auth/routes";

/**
 * `POST /api/auth/login/totp`: the code step of a paused sign-in.
 *
 * The pending token comes from the sealed cookie the password step set, never
 * from the body, so a page script cannot supply one of its own. On success both
 * cookies are written at once: the session replaces the pause, and the pause is
 * cleared in the same answer, so there is no window where a completed sign-in
 * still has an unfinished one beside it.
 */

const bodySchema = z.object({
  code: z.string().min(1).max(64),
});

export async function POST(request: Request): Promise<Response> {
  const origin = requireSameOrigin(request);
  if (origin !== null) return origin;

  const pending = await pendingFromRequest(request);
  if (pending === null) {
    return jsonError(
      401,
      ERROR_CODES.loginExpired,
      "That sign-in attempt has expired. Sign in again.",
    );
  }

  const body = await readJsonBody(request, bodySchema);
  if (!body.ok) return body.response;

  try {
    const session = await sessionFromTotp(pending, body.value.code);
    return withSetCookies(jsonOk(sessionSummary(session)), [
      await sessionSetCookie(session),
      clearedPendingSetCookie(),
    ]);
  } catch (error) {
    return responseForFailure(error);
  }
}
