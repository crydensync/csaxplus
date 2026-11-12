import { requireAdmin } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonOk } from "@/server/auth/response";
import { fetchAuditEvents } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

function filtersFrom(url: URL) {
  const params = url.searchParams;
  return {
    eventType: params.get("event_type") || undefined,
    userID: params.get("user_id") || undefined,
    since: params.get("since") || undefined,
    until: params.get("until") || undefined,
  };
}

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit") ?? 50);
  const cursor = params.get("cursor") || undefined;
  try {
    const result = await fetchAuditEvents({
      token: authorized.session.api.accessToken,
      filters: filtersFrom(new URL(request.url)),
      cursor,
      limit,
    });
    return authorized.respond(jsonOk(result));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
