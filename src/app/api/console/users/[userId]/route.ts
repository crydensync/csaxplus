import { requireSession } from "@/server/auth/guard";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { isUserIdSegment } from "@/server/cryden/admin";
import { readUser } from "@/server/users/browse";

/**
 * `GET /api/console/users/{userId}`: one account, its live session count, its
 * recent history, and its metadata.
 *
 * The id is a path segment the browser chose, and the first thing done with it
 * is a check that it is one. It goes into the URL of the request this console
 * makes to the API, so a value carrying a slash, a query mark or a traversal is
 * not a bad account id, it is a request for something else. See
 * `isUserIdSegment`.
 *
 * The API's answer is passed through as the section states `readUser` composes,
 * including a 404: an id that resolves to nothing is a state the drawer renders,
 * not an error this route invents a status for.
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;

  const { userId } = await context.params;
  if (!isUserIdSegment(userId)) {
    return authorized.respond(
      jsonError(
        400,
        ERROR_CODES.invalidRequest,
        "That is not an account id the console can look up.",
      ),
    );
  }

  const detail = await readUser({
    token: authorized.session.api.accessToken,
    userId,
  });

  return authorized.respond(jsonOk(detail));
}
