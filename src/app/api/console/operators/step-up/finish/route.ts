import { z } from "zod";

import { requireOwnerMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { serializeCookie } from "@/server/auth/cookies";
import { jsonError, jsonOk, ERROR_CODES } from "@/server/auth/response";
import { readJsonBody } from "@/server/auth/routes";
import {
  SESSION_COOKIE,
  sealSession,
  sessionCookieOptions,
  shouldUseSecureCookie,
} from "@/server/auth/session";
import { finishOperatorStepUp } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";
const schema = z.object({
  purpose: z.enum(["operator_role_change", "operator_remove"]),
  credential: z.unknown(),
});

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireOwnerMutation(request);
  if (!authorized.ok) return authorized.response;
  const body = await readJsonBody(request, schema);
  if (!body.ok) return authorized.respond(body.response);
  const ceremony = authorized.session.operatorStepUp;
  if (!ceremony || ceremony.purpose !== body.value.purpose)
    return authorized.respond(
      jsonError(
        409,
        ERROR_CODES.invalidRequest,
        "Start a fresh passkey confirmation for this action.",
      ),
    );
  try {
    const grant = await finishOperatorStepUp({
      token: authorized.session.api.accessToken,
      purpose: body.value.purpose,
      ceremonyToken: ceremony.ceremonyToken,
      credential: body.value.credential,
    });
    const session = {
      ...authorized.session,
      operatorStepUp: null,
      operatorGrant: { purpose: body.value.purpose, token: grant },
    };
    const response = authorized.respond(jsonOk({ verified: true }));
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
