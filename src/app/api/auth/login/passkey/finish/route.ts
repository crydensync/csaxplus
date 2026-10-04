import { z } from "zod";

import { responseForFailure } from "@/server/auth/failures";
import { sessionFromPasskey } from "@/server/auth/flow";
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
 * `POST /api/auth/login/passkey/finish`: the signed challenge comes back.
 *
 * The body carries only what the browser's credential helper produced. Both
 * tokens that authorise this step, the pending login and the ceremony, are read
 * from the sealed cookie, so a page that could call this endpoint still could
 * not complete a ceremony it did not start. Verification is the API's, against
 * the public key it stored at enrolment; the console does not decide whether a
 * passkey is valid.
 */

const bodySchema = z.object({
  /** `RegistrationResponseJSON`-shaped, validated by the API rather than here. */
  credential: z.unknown(),
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

  if (pending.ceremonyToken === null) {
    return jsonError(
      400,
      ERROR_CODES.invalidRequest,
      "Start the passkey step before finishing it.",
    );
  }

  try {
    const session = await sessionFromPasskey(pending, pending.ceremonyToken, body.value.credential);
    return withSetCookies(jsonOk(sessionSummary(session)), [
      await sessionSetCookie(session),
      clearedPendingSetCookie(),
    ]);
  } catch (error) {
    return responseForFailure(error);
  }
}
