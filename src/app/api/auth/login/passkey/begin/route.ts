import { responseForFailure } from "@/server/auth/failures";
import { beginPasskeyStep } from "@/server/auth/flow";
import { requireSameOrigin, withSetCookies } from "@/server/auth/guard";
import { withCeremonyToken } from "@/server/auth/pending";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { pendingFromRequest, pendingSetCookie } from "@/server/auth/routes";

/**
 * `POST /api/auth/login/passkey/begin`: hands the browser a challenge to sign.
 *
 * The challenge is public by design, and is the one thing here that does go to
 * the page. The ceremony token that comes back with it does not: it is written
 * into the sealed pending cookie, which the finish step reads, so the browser
 * carries it without being able to read it.
 *
 * A passkey is never a way in on its own in CrydenSync. This step only exists
 * after a password has already been accepted, which is what the pending cookie
 * proves.
 */

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

  try {
    const challenge = await beginPasskeyStep(pending);
    const cookie = await pendingSetCookie(withCeremonyToken(pending, challenge.ceremonyToken));
    return withSetCookies(jsonOk({ options: challenge.options }), [cookie]);
  } catch (error) {
    return responseForFailure(error);
  }
}
