import { requireAdmin } from "@/server/auth/guard";
import { jsonOk } from "@/server/auth/response";
import { readDigestHistory } from "@/server/digest/report";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  return authorized.respond(
    jsonOk(await readDigestHistory({ token: authorized.session.api.accessToken })),
  );
}
