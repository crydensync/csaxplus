import { requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk } from "@/server/auth/response";
import { fetchLLMModels } from "@/server/cryden/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  api_key: z.string().min(1).max(4096),
  base_url: z.string().url().max(2048),
});

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return authorized.respond(
      jsonError(400, "invalid_request", "Enter a valid base URL and API key."),
    );
  try {
    return authorized.respond(
      jsonOk({
        models: await fetchLLMModels({ token: authorized.session.api.accessToken, ...parsed.data }),
      }),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
