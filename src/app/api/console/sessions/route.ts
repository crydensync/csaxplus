import { requireAdmin, requireMutation, withSetCookies } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonOk } from "@/server/auth/response";
import { clearedSessionSetCookie } from "@/server/auth/routes";
import { fetchAdminSessions, revokeAllAdminSessions } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit") ?? 25);
  const offset = Number(params.get("offset") ?? 0);
  try {
    const result = await fetchAdminSessions({
      token: authorized.session.api.accessToken,
      limit,
      offset,
    });
    return authorized.respond(jsonOk(result));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  try {
    const revoked = await revokeAllAdminSessions({ token: authorized.session.api.accessToken });
    return withSetCookies(authorized.respond(jsonOk({ revoked })), [clearedSessionSetCookie()]);
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
