import { requireSession } from "@/server/auth/guard";
import { jsonOk } from "@/server/auth/response";
import { readSystemPage } from "@/server/system/status";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;
  const report = await readSystemPage(authorized.session.api.accessToken);
  return authorized.respond(jsonOk(report));
}
