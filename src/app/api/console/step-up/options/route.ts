import { z } from "zod";

import { requireMutation } from "@/server/auth/guard";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { readJsonBody } from "@/server/auth/routes";
import { getConsoleStore } from "@/server/db/index";
import { isStepUpPurpose, STEP_UP_PURPOSES } from "@/server/store/grants";
import { beginStepUp } from "@/server/stepup/ceremonies";
import { responseForCeremony } from "@/server/stepup/failures";

/**
 * `POST /api/console/step-up/options`: the options that ask the operator to
 * touch their key.
 *
 * The purpose is named by the caller and checked against the closed set the
 * console knows. It is carried through to the grant, so a step-up earned to
 * remove a passkey cannot be spent on registering one: the wider permission
 * never quietly rides along with the narrower.
 *
 * Behind `requireMutation` rather than the read guard. Nothing is changed by
 * asking for options, but a ceremony is the prelude to a change, and a viewer
 * who may not change anything has no reason to be handed one.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ purpose: z.enum(STEP_UP_PURPOSES) });

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;

  const body = await readJsonBody(request, bodySchema);
  if (!body.ok) return authorized.respond(body.response);

  // `z.enum` has already refused anything else. This is the second half of the
  // same rule, and it is what keeps `StepUpPurpose` from being widened in one
  // place and not the other.
  if (!isStepUpPurpose(body.value.purpose)) {
    return authorized.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "That is not something this console steps up for."),
    );
  }

  try {
    const offer = await beginStepUp(getConsoleStore().driver, {
      operatorId: authorized.session.operator.id,
      at: new Date(),
    });
    return authorized.respond(jsonOk({ challengeId: offer.challengeId, options: offer.options }));
  } catch (error) {
    const refusal = responseForCeremony(error);
    if (refusal !== null) return authorized.respond(refusal);
    return authorized.respond(
      jsonError(500, ERROR_CODES.internal, "The console could not start that step-up."),
    );
  }
}
