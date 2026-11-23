import { z } from "zod";

import { requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { serializeCookie } from "@/server/auth/cookies";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { readJsonBody } from "@/server/auth/routes";
import {
  SESSION_COOKIE,
  sealSession,
  sessionCookieOptions,
  shouldUseSecureCookie,
} from "@/server/auth/session";
import { beginOperatorStepUp } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";
const schema = z.object({
  purpose: z.enum([
    "operator_role_change",
    "operator_remove",
    "operator_session_revoke",
    "operator_passkey_remove",
    "operator_invite",
    "secret_reveal",
    "secret_mutation",
  ]),
});

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const body = await readJsonBody(request, schema);
  if (!body.ok) return authorized.respond(body.response);
  if (body.value.purpose.startsWith("operator_") && authorized.role !== "owner")
    return authorized.respond(
      jsonError(403, ERROR_CODES.forbidden, "Only an owner can perform this operator action."),
    );
  try {
    const offer = await beginOperatorStepUp({
      token: authorized.session.api.accessToken,
      purpose: body.value.purpose,
    });
    const session = {
      ...authorized.session,
      operatorGrant: null,
      operatorStepUp: { purpose: body.value.purpose, ceremonyToken: offer.ceremony_token },
    };
    const response = authorized.respond(jsonOk({ public_key: offer.public_key }));
    response.headers.append(
      "set-cookie",
      serializeCookie(
        SESSION_COOKIE,
        await sealSession(session),
        sessionCookieOptions(shouldUseSecureCookie()),
      ),
    );
    return response;
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
