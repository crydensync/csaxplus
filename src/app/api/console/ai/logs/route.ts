import { requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonOk } from "@/server/auth/response";
import { summarizeAdminLogs } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  try {
    return authorized.respond(jsonOk(await summarizeAdminLogs(authorized.session.api.accessToken)));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
