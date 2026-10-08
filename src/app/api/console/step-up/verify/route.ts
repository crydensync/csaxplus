import { z } from "zod";

import { requireMutation } from "@/server/auth/guard";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { readJsonBody } from "@/server/auth/routes";
import { getConsoleStore } from "@/server/db/index";
import { issueGrant, STEP_UP_PURPOSES } from "@/server/store/grants";
import { authenticationResponseSchema, toAuthenticationResponse } from "@/server/stepup/bodies";
import { finishStepUp } from "@/server/stepup/ceremonies";
import { responseForCeremony } from "@/server/stepup/failures";
import { passkeySummary } from "@/server/stepup/summary";

/**
 * `POST /api/console/step-up/verify`: the authenticator's answer, turned into a
 * grant.
 *
 * This is where a session stops being merely a cookie. Everything up to here has
 * shown that someone holds the session; a passkey answer shows that the operator
 * themselves is at the machine, and the grant is that fact written down where
 * the request that needs it can find it.
 *
 * The grant is bound to the operator, to this session and to the purpose the
 * caller named, and it is handed to the browser to carry back. It is worth
 * nothing on its own: it cannot be spent from another session, it cannot be
 * spent for another purpose, it lasts twenty seconds and it is spent by the
 * first request that uses it. A stolen grant is worth no more than the session
 * it was earned in, which is the session that would have to have been stolen
 * first.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  purpose: z.enum(STEP_UP_PURPOSES),
  challengeId: z.uuid(),
  response: authenticationResponseSchema,
});

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;

  const body = await readJsonBody(request, bodySchema);
  if (!body.ok) return authorized.respond(body.response);

  const store = getConsoleStore();
  const session = authorized.session;

  try {
    const passkey = await finishStepUp(store.driver, {
      operatorId: session.operator.id,
      challengeId: body.value.challengeId,
      response: toAuthenticationResponse(body.value.response),
      at: new Date(),
    });

    const grantId = await issueGrant(store.driver, {
      operatorId: session.operator.id,
      sessionId: session.sid,
      purpose: body.value.purpose,
      at: new Date(),
    });

    return authorized.respond(jsonOk({ grantId, passkey: passkeySummary(passkey) }));
  } catch (error) {
    const refusal = responseForCeremony(error);
    if (refusal !== null) return authorized.respond(refusal);
    return authorized.respond(
      jsonError(500, ERROR_CODES.internal, "The console could not complete that step-up."),
    );
  }
}
