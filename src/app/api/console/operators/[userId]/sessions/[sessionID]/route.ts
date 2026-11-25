import { requireOwnerMutation } from "@/server/auth/guard";
import { jsonError, jsonOk, ERROR_CODES } from "@/server/auth/response";
import { isUserIdSegment, revokeOperatorSession } from "@/server/cryden/admin";
import { withOperatorGrant } from "@/server/auth/operator-grant";

export const dynamic = "force-dynamic";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string; sessionID: string }> },
): Promise<Response> {
  const auth = await requireOwnerMutation(request);
  if (!auth.ok) return auth.response;
  const { userId, sessionID } = await context.params;
  if (!isUserIdSegment(userId) || !isUserIdSegment(sessionID))
    return auth.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "That operator or session id is invalid."),
    );
  return withOperatorGrant(auth, "operator_session_revoke", async (grant) => {
    await revokeOperatorSession({
      token: auth.session.api.accessToken,
      grant,
      userID: userId,
      sessionID,
    });
    return jsonOk({ revoked: true });
  });
}
