import { requireSession } from "@/server/auth/guard";
import { jsonOk } from "@/server/auth/response";
import { readOAuthProviders } from "@/server/oauth/providers";

/**
 * `GET /api/console/oauth/providers`: which OAuth providers this deployment
 * has credentials for.
 *
 * A console route rather than a call from the page's server component, for
 * the reason the dashboard's and Users screen's routes give: the API access
 * token needs renewing when it is close to expiry, and only a route handler
 * can write the cookie that renewal sets.
 *
 * No role check of its own. Reading configuration is what a `viewer` console
 * account may do, and whether the API agrees is the API's answer to give.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;

  const providers = await readOAuthProviders({
    token: authorized.session.api.accessToken,
  });

  return authorized.respond(jsonOk(providers));
}
