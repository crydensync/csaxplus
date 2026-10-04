import { signOut } from "@/server/auth/flow";
import { requireCsrf, withSetCookies } from "@/server/auth/guard";
import { jsonOk } from "@/server/auth/response";
import { clearedSessionSetCookie } from "@/server/auth/routes";

/**
 * `POST /api/auth/logout`.
 *
 * Not `requireMutation`, because signing out is not a privileged change: a
 * viewer is read-only, not unable to leave. It still needs the origin and CSRF
 * checks, since a site that could sign an operator out at will is a nuisance
 * worth refusing.
 *
 * The console cookie is cleared whatever the API says. Leaving an operator
 * signed in to the console because the API was unreachable would be the wrong
 * way round, so the answer reports which of the two actually happened: `revoked`
 * is true only when the API confirmed it ended its own session too. See
 * DECISIONS.md D11.
 */

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireCsrf(request);
  if (!authorized.ok) return authorized.response;

  const { revoked } = await signOut(authorized.session);
  return withSetCookies(jsonOk({ revoked }), [clearedSessionSetCookie()]);
}
