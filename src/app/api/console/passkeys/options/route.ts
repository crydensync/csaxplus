import { z } from "zod";

import { responseForFailure } from "@/server/auth/failures";
import { requireMutation } from "@/server/auth/guard";
import { jsonOk } from "@/server/auth/response";
import { readJsonBody } from "@/server/auth/routes";
import { beginRegistration } from "@/server/cryden/passkeys";

/**
 * `POST /api/console/passkeys/options`: the options that enrol a new passkey.
 *
 * The options are the API's, not the console's. This route asks for them with the
 * operator's token and hands them on unchanged, and the ceremony token that comes
 * back with them goes to the browser so the next call can name the ceremony it is
 * answering. Nothing about the challenge is decided or stored here.
 *
 * Gated on `requireMutation`: a viewer may read, not change. The old console
 * exempted the *first* passkey from its step-up, because there would have been
 * nothing to step up with; there is no such exemption left to make, since the
 * console no longer runs the ceremony. Confirming it is you before removing a
 * credential is the API's job now, and it does that with the password.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({});

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;

  const body = await readJsonBody(request, bodySchema);
  if (!body.ok) return authorized.respond(body.response);

  try {
    const offer = await beginRegistration({ token: authorized.session.api.accessToken });
    return authorized.respond(jsonOk(offer));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
