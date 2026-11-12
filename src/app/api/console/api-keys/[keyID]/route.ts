import { requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonOk } from "@/server/auth/response";
import { revokeApiKey } from "@/server/auth/api-auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ keyID: string }> },
): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const { keyID } = await context.params;
  try {
    await revokeApiKey(authorized.session.api.accessToken, keyID);
    return authorized.respond(jsonOk({ status: "api key revoked" }));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
