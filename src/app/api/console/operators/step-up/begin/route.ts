import { z } from "zod";

import { requireOwnerMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { serializeCookie } from "@/server/auth/cookies";
import { jsonOk } from "@/server/auth/response";
import { readJsonBody } from "@/server/auth/routes";
import {
  SESSION_COOKIE,
  sealSession,
  sessionCookieOptions,
  shouldUseSecureCookie,
} from "@/server/auth/session";
import { beginOperatorStepUp } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";
const schema = z.object({ purpose: z.enum(["operator_role_change", "operator_remove"]) });

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireOwnerMutation(request);
  if (!authorized.ok) return authorized.response;
  const body = await readJsonBody(request, schema);
  if (!body.ok) return authorized.respond(body.response);
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
