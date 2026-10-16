import { requireMutation } from "@/server/auth/guard";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { isUserIdSegment, type UserAction } from "@/server/cryden/admin";
import { actionUser } from "@/server/users/actions";

/**
 * `POST /api/console/users/{userId}/{action}`: one account action, relayed to
 * the API on the operator's behalf.
 *
 * The verbs the API exposes are fixed and small (unlock, suspend, unsuspend,
 * revoke-sessions, mfa-disable), so rather than five route files that repeat the
 * same guard sequence, one segment picks the action and this file holds the
 * sequence once. The action name is checked against the union before anything
 * else, so a URL spelling this console does not offer is a 404 rather than a
 * guess at what the caller meant.
 *
 * `requireMutation`, not `requireAdmin`: the console's viewer role is read-only
 * by the console's own rule, so the role check happens here before the call.
 * The API runs its own admin gate behind these paths as well, and a token that
 * passes here and fails there arrives as the `forbidden` section the drawer
 * words, so the two layers can disagree only in the direction of more refusal.
 */

export const dynamic = "force-dynamic";

const ACTIONS: ReadonlySet<string> = new Set([
  "unlock",
  "suspend",
  "unsuspend",
  "revoke-sessions",
  "mfa-disable",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string; action: string }> },
): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;

  const { userId, action } = await context.params;
  if (!ACTIONS.has(action)) {
    return authorized.respond(
      jsonError(404, ERROR_CODES.notFound, "The console has no such action for an account."),
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

  const result = await actionUser({
    token: authorized.session.api.accessToken,
    userId,
    action: action as UserAction,
  });

  if (result.state !== "ok") {
    const code = result.state === "empty" ? ERROR_CODES.notFound : result.code;
    return authorized.respond(jsonError(502, code ?? ERROR_CODES.conflict, result.detail));
  }
  return authorized.respond(jsonOk(result.data));
}
