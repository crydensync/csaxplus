import { requireSession } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk, ERROR_CODES } from "@/server/auth/response";
import { isUserIdSegment, fetchOperatorPasskeys } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;
  if (auth.role !== "owner")
    return auth.respond(
      jsonError(403, ERROR_CODES.forbidden, "Only an owner can manage operator passkeys."),
    );
  const { userId } = await context.params;
  if (!isUserIdSegment(userId))
    return auth.respond(jsonError(400, ERROR_CODES.invalidRequest, "That operator id is invalid."));
  try {
    return auth.respond(
      jsonOk(await fetchOperatorPasskeys({ token: auth.session.api.accessToken, userID: userId })),
    );
  } catch (error) {
    return auth.respond(responseForFailure(error));
  }
}
