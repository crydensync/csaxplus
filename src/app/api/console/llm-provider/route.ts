import { requireAdmin } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonOk } from "@/server/auth/response";
import { fetchLLMProvider } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  try {
    return authorized.respond(
      jsonOk(await fetchLLMProvider({ token: authorized.session.api.accessToken })),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
