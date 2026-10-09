import { z } from "zod";

import { responseForFailure } from "@/server/auth/failures";
import { requireMutation, requireSession } from "@/server/auth/guard";
import { jsonOk } from "@/server/auth/response";
import { readJsonBody } from "@/server/auth/routes";
import { fetchPasskeys, finishRegistration } from "@/server/cryden/passkeys";

/**
 * `GET /api/console/passkeys`: the passkeys the signed-in operator holds at the
 * API.
 *
 * The credential belongs to the operator's API account, not to this console. The
 * API's token says whose list this is, so nothing here names an account and there
 * is no way to ask for anyone else's. Every other console screen that reads the
 * API does the same thing for the same reason.
 *
 * `POST /api/console/passkeys`: the authenticator's answer to an enrolment, sent
 * on to the API to be verified.
 *
 * The write goes through `requireMutation`, so it is refused for a viewer and for
 * a request without the session's CSRF token, exactly as every other change the
 * console makes is. The enrolment is no longer the console's own ceremony, so
 * there is no longer a reason to exempt it: the ceremony token that ties the two
 * halves together is the API's, and the console only carries it.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;

  try {
    const passkeys = await fetchPasskeys({ token: authorized.session.api.accessToken });
    return authorized.respond(jsonOk({ passkeys }));
  } catch (error) {
    // The API's own code and wording, passed through. The screen switches on the
    // code, so a deployment with no passkey store configured reads differently
    // from one that refused the token.
    return authorized.respond(responseForFailure(error));
  }
}

const bodySchema = z.object({
  /**
   * Opaque to the console. It is the API's own ceremony token, carried back
   * unread, which is what the API requires of it. Only its presence matters here.
   */
  ceremonyToken: z.string().min(1).max(4096),
  /** What the operator called this key. Shown back to them, so it is bounded. */
  nickname: z.string().trim().min(1).max(64),
  /**
   * The browser's `RegistrationResponseJSON`, forwarded as produced. Checked only
   * for being an object: the engine verifies it against the ceremony, and that
   * verification is the only check that decides anything.
   */
  credential: z.record(z.string(), z.unknown()),
});

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;

  const body = await readJsonBody(request, bodySchema);
  if (!body.ok) return authorized.respond(body.response);

  try {
    await finishRegistration({
      token: authorized.session.api.accessToken,
      ceremonyToken: body.value.ceremonyToken,
      credential: body.value.credential,
      nickname: body.value.nickname,
    });
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }

  // The API's own answer is `{"status": "passkey registered"}`, which is not
  // relayed: the screen re-reads the list afterwards, so what it shows is what the
  // API holds rather than what one response claimed.
  return authorized.respond(jsonOk({ enrolled: true }));
}
