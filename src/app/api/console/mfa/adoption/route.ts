import { requireSession } from "@/server/auth/guard";
import { jsonOk } from "@/server/auth/response";
import { readMfaAdoption } from "@/server/mfa/adoption";

/**
 * `GET /api/console/mfa/adoption`: the second-factor report, for the operator
 * whose session cookie came with the request.
 *
 * A console route rather than a call from the page's server component, for the
 * reason the dashboard's and OAuth screen's routes give: the API access token
 * needs renewing when it is close to expiry, and only a route handler can write
 * the cookie that renewal sets.
 *
 * No role check of its own. Reading a report is what a `viewer` console account
 * may do, and whether the API agrees is the API's answer to give; the section
 * states handed back say exactly what the API answered.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;

  const report = await readMfaAdoption({
    token: authorized.session.api.accessToken,
  });

  return authorized.respond(jsonOk(report));
}
