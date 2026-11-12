import { requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonOk } from "@/server/auth/response";
import { revokeAdminSession } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ sessionID: string }> },
): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const { sessionID } = await context.params;
  try {
    await revokeAdminSession({ token: authorized.session.api.accessToken, sessionID });
    return authorized.respond(jsonOk({ status: "session revoked" }));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
