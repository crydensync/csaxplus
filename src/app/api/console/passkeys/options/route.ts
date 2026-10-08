import { z } from "zod";

import { requireMutationOn, requireSession, requireStepUp } from "@/server/auth/guard";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { readJsonBody } from "@/server/auth/routes";
import { getConsoleStore } from "@/server/db/index";
import { countPasskeys } from "@/server/store/passkeys";
import { beginRegistration } from "@/server/stepup/ceremonies";
import { responseForCeremony } from "@/server/stepup/failures";

/**
 * `POST /api/console/passkeys/options`: the options that enrol a new passkey.
 *
 * Registering the *first* passkey needs no step-up, and could not: there is
 * nothing to step up with, so requiring a grant would mean the first passkey
 * could never be registered and the console's second factor could never be
 * turned on at all. Every one after that is gated, which is what stops a stolen
 * session from enrolling the attacker's own key alongside the operator's.
 *
 * The role and CSRF checks run either way. What the first passkey is exempt from
 * is the grant, not the permission to change something: a viewer holds no key
 * and may enrol none, and reading this route as "no checks when the list is
 * empty" would have let one through.
 *
 * The grant is spent here, when the options are handed out, rather than when the
 * authenticator answers. A ceremony is allowed a minute to complete, and the
 * grant is good for twenty seconds, so a grant held until the answer arrived
 * would usually have expired by the time it was needed. Spending it at the start
 * is sound because the challenge that ties the two requests together is only
 * issued from inside this route, so an answer cannot exist without having come
 * through the gate.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({});

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;

  const body = await readJsonBody(request, bodySchema);
  if (!body.ok) return authorized.respond(body.response);

  const store = getConsoleStore();
  const operatorId = authorized.session.operator.id;
  const held = await countPasskeys(store.driver, operatorId);

  const permitted = await requireMutationOn(authorized, request);
  if (!permitted.ok) return permitted.response;

  let gate = permitted;
  if (held > 0) {
    const confirmed = await requireStepUp(permitted, request, "passkey.register");
    if (!confirmed.ok) return confirmed.response;
    gate = confirmed;
  }

  try {
    const offer = await beginRegistration(store.driver, {
      operatorId,
      label: gate.session.operator.label,
      at: new Date(),
    });
    return gate.respond(jsonOk({ challengeId: offer.challengeId, options: offer.options }));
  } catch (error) {
    const refusal = responseForCeremony(error);
    if (refusal !== null) return gate.respond(refusal);
    return gate.respond(
      jsonError(500, ERROR_CODES.internal, "The console could not start that registration."),
    );
  }
}
