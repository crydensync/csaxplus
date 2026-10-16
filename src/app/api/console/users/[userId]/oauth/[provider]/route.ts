import { requireMutation } from "@/server/auth/guard";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { isUserIdSegment, userOAuthPath } from "@/server/cryden/admin";
import { unlinkOAuth } from "@/server/users/actions";

/**
 * `DELETE /api/console/users/{userId}/oauth/{provider}`: remove one linked
 * identity from an account, relayed to the API.
 *
 * Own route rather than a verb on the action path, because the provider is a
 * second path segment the browser chose: `userOAuthPath` checks both segments
 * (the id against the segment rule, the provider against the lowercase-name
 * shape the engine's configuration actually uses) before the URL is built, so
 * path syntax cannot arrive here dressed as either one.
 *
 * A provider the account never linked is the API's 404 and arrives as an error
 * with its own sentence, not as a success an operator cannot distinguish from
 * work done.
 */

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string; provider: string }> },
): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;

  const { userId, provider } = await context.params;
  if (userOAuthPath(userId, provider) === null) {
    return authorized.respond(
      jsonError(
        400,
        ERROR_CODES.invalidRequest,
        "That is not an account id and provider the console can send.",
      ),
    );
  }
  if (!isUserIdSegment(userId)) {
    return authorized.respond(
      jsonError(
        400,
        ERROR_CODES.invalidRequest,
        "That is not an account id the console can act on.",
      ),
    );
  }

  const result = await unlinkOAuth({
    token: authorized.session.api.accessToken,
    userId,
    provider,
  });

  if (result.state !== "ok") {
    const code = result.state === "empty" ? ERROR_CODES.notFound : result.code;
    return authorized.respond(jsonError(502, code ?? ERROR_CODES.conflict, result.detail));
  }
  return authorized.respond(jsonOk(result.data));
}
