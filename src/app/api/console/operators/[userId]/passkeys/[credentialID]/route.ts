import { requireOwnerMutation } from "@/server/auth/guard";
import { jsonError, jsonOk, ERROR_CODES } from "@/server/auth/response";
import { isUserIdSegment, removeOperatorPasskey } from "@/server/cryden/admin";
import { withOperatorGrant } from "@/server/auth/operator-grant";

export const dynamic = "force-dynamic";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string; credentialID: string }> },
): Promise<Response> {
  const auth = await requireOwnerMutation(request);
  if (!auth.ok) return auth.response;
  const { userId, credentialID } = await context.params;
  if (!isUserIdSegment(userId) || !/^[A-Za-z0-9_-]+={0,2}$/.test(credentialID))
    return auth.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "That operator or passkey id is invalid."),
    );
  return withOperatorGrant(auth, "operator_passkey_remove", async (grant) => {
    await removeOperatorPasskey({
      token: auth.session.api.accessToken,
      grant,
      userID: userId,
      credentialID,
    });
    return jsonOk({ removed: true });
  });
}
