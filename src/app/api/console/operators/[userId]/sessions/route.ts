import { requireOwnerMutation, requireSession } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk, ERROR_CODES } from "@/server/auth/response";
import {
  isUserIdSegment,
  fetchOperatorSessions,
  revokeOperatorSessions,
} from "@/server/cryden/admin";
import { withOperatorGrant } from "@/server/auth/operator-grant";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ userId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;
  if (auth.role !== "owner")
    return auth.respond(
      jsonError(403, ERROR_CODES.forbidden, "Only an owner can manage operator sessions."),
    );
  const { userId } = await context.params;
  if (!isUserIdSegment(userId))
    return auth.respond(jsonError(400, ERROR_CODES.invalidRequest, "That operator id is invalid."));
  try {
    return auth.respond(
      jsonOk(await fetchOperatorSessions({ token: auth.session.api.accessToken, userID: userId })),
    );
  } catch (error) {
    return auth.respond(responseForFailure(error));
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const auth = await requireOwnerMutation(request);
  if (!auth.ok) return auth.response;
  const { userId } = await context.params;
  if (!isUserIdSegment(userId))
    return auth.respond(jsonError(400, ERROR_CODES.invalidRequest, "That operator id is invalid."));
  return withOperatorGrant(auth, "operator_session_revoke", async (grant) =>
    jsonOk({
      revoked: await revokeOperatorSessions({
        token: auth.session.api.accessToken,
        grant,
        userID: userId,
      }),
    }),
  );
}
