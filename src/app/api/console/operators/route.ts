import { requireAdmin } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonOk } from "@/server/auth/response";
import { fetchAdminOperators } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  try {
    const result = await fetchAdminOperators({ token: authorized.session.api.accessToken });
    return authorized.respond(jsonOk(result));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
