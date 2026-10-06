import { requireSession } from "@/server/auth/guard";
import { jsonOk } from "@/server/auth/response";
import { dashboardOverview } from "@/server/dashboard/overview";

/**
 * `GET /api/console/dashboard`: everything the dashboard shows, for the operator
 * whose session cookie came with the request.
 *
 * A console route rather than a call from the page's server component, and the
 * reason is the access token. The API's access token lives fifteen minutes and
 * only a route handler can renew it, because renewal writes a cookie and a
 * server component cannot. A screen that read the API directly would therefore
 * work until the token turned over and then show four failures until the operator
 * signed out and back in. `requireSession` renews here, and `respond` carries the
 * new cookie out with the answer.
 *
 * No role check of its own. The API decides who is an operator from the token's
 * own claim, so a second copy of that rule here would be a rule the console can
 * get wrong: the section states it hands back say exactly what the API answered.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;

  const overview = await dashboardOverview(authorized.session.api.accessToken);
  return authorized.respond(jsonOk(overview));
}
