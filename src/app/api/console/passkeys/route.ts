import { z } from "zod";

import { requireSession } from "@/server/auth/guard";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { readJsonBody } from "@/server/auth/routes";
import { getConsoleStore } from "@/server/db/index";
import { listPasskeys } from "@/server/store/passkeys";
import { registrationResponseSchema, toRegistrationResponse } from "@/server/stepup/bodies";
import { finishRegistration } from "@/server/stepup/ceremonies";
import { responseForCeremony } from "@/server/stepup/failures";
import { passkeySummary } from "@/server/stepup/summary";

/**
 * `GET /api/console/passkeys`: the step-up passkeys the signed-in operator has
 * registered with this console.
 *
 * Scoped to the session's own operator and to nothing else. There is no route
 * that lists another operator's passkeys, because there is nothing the console
 * would do with them: these are a second factor for one person's own session.
 *
 * `POST /api/console/passkeys`: the authenticator's answer to a registration,
 * stored.
 *
 * No step-up of its own, and none is needed: the challenge this spends is only
 * ever issued by `passkeys/options`, which is where the gate is. The role check
 * is there too, and for the same reason: an operator who may not change anything
 * is refused before they are ever handed a challenge, so there is none for this
 * route to have to re-check.
 *
 * Both answers come through `requireSession` rather than `requireMutation`. The
 * read is a read. The write completes a ceremony that was already authorised,
 * and its body is the authenticator's rather than a form's: a challenge issued
 * to one session cannot be answered from another, and an authenticator signs
 * over the origin it was invoked on, so the checks the mutation guard would add
 * are ones the ceremony already makes.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;

  const held = await listPasskeys(getConsoleStore().driver, authorized.session.operator.id);

  return authorized.respond(jsonOk({ passkeys: held.map(passkeySummary) }));
}

const bodySchema = z.object({
  challengeId: z.uuid(),
  /** What the operator called this key. Shown back to them, so it is bounded. */
  deviceName: z.string().trim().min(1).max(64),
  response: registrationResponseSchema,
});

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;

  const body = await readJsonBody(request, bodySchema);
  if (!body.ok) return authorized.respond(body.response);

  try {
    const passkey = await finishRegistration(getConsoleStore().driver, {
      operatorId: authorized.session.operator.id,
      challengeId: body.value.challengeId,
      response: toRegistrationResponse(body.value.response),
      deviceName: body.value.deviceName,
      at: new Date(),
    });
    return authorized.respond(jsonOk({ passkey: passkeySummary(passkey) }));
  } catch (error) {
    const refusal = responseForCeremony(error);
    if (refusal !== null) return authorized.respond(refusal);
    return authorized.respond(
      jsonError(500, ERROR_CODES.internal, "The console could not store that passkey."),
    );
  }
}
