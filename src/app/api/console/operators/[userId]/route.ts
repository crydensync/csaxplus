import { z } from "zod";

import { requireOwnerMutation } from "@/server/auth/guard";
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
import { changeOperatorRole, isUserIdSegment, removeOperator } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";
const roleSchema = z.object({ role: z.enum(["owner", "admin", "viewer"]) });
type Purpose = "operator_role_change" | "operator_remove";

async function withGrantCleared(
  authorized: Extract<Awaited<ReturnType<typeof requireOwnerMutation>>, { ok: true }>,
  purpose: Purpose,
  work: (grant: string) => Promise<Response>,
): Promise<Response> {
  const grant = authorized.session.operatorGrant;
  if (!grant || grant.purpose !== purpose)
    return authorized.respond(
      jsonError(
        409,
        ERROR_CODES.invalidRequest,
        "Confirm your passkey before changing operator access.",
      ),
    );
  let response: Response;
  try {
    response = await work(grant.token);
  } catch (error) {
    response = responseForFailure(error);
  }
  const session = { ...authorized.session, operatorGrant: null, operatorStepUp: null };
  response = authorized.respond(response);
  response.headers.append(
    "set-cookie",
    serializeCookie(
      SESSION_COOKIE,
      await sealSession(session),
      sessionCookieOptions(shouldUseSecureCookie()),
    ),
  );
  return response;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const authorized = await requireOwnerMutation(request);
  if (!authorized.ok) return authorized.response;
  const { userId } = await context.params;
  if (!isUserIdSegment(userId))
    return authorized.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "That operator id is invalid."),
    );
  const body = await readJsonBody(request, roleSchema);
  if (!body.ok) return authorized.respond(body.response);
  return withGrantCleared(authorized, "operator_role_change", async (grant) => {
    await changeOperatorRole({
      token: authorized.session.api.accessToken,
      grant,
      userID: userId,
      role: body.value.role,
    });
    return jsonOk({ updated: true });
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const authorized = await requireOwnerMutation(request);
  if (!authorized.ok) return authorized.response;
  const { userId } = await context.params;
  if (!isUserIdSegment(userId))
    return authorized.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "That operator id is invalid."),
    );
  return withGrantCleared(authorized, "operator_remove", async (grant) => {
    await removeOperator({ token: authorized.session.api.accessToken, grant, userID: userId });
    return jsonOk({ removed: true });
  });
}
