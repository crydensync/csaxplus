import { z } from "zod";

import { responseForFailure } from "@/server/auth/failures";
import { sessionFromRecoveryCode } from "@/server/auth/flow";
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
 * `POST /api/auth/login/recovery-code`: the way in for an operator who has lost
 * the device their second factor lived on.
 *
 * The API spends the code, so a code that is used twice fails the second time.
 * The console says so plainly rather than treating it as a wrong code: the two
 * deserve different words, and only the API can tell them apart.
 */

const bodySchema = z.object({
  code: z.string().min(1).max(128),
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
    const session = await sessionFromRecoveryCode(pending, body.value.code);
    return withSetCookies(jsonOk(sessionSummary(session)), [
      await sessionSetCookie(session),
      clearedPendingSetCookie(),
    ]);
  } catch (error) {
    return responseForFailure(error);
  }
}
