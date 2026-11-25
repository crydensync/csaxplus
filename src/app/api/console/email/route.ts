import { requireSession } from "@/server/auth/guard";
import { jsonOk } from "@/server/auth/response";
import { readEmailPage } from "@/server/email/report";

/** Read email activity and template status for the current operator. */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;

  const report = await readEmailPage({ token: authorized.session.api.accessToken });
  return authorized.respond(jsonOk(report));
}
