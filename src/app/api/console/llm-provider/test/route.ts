import { requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk } from "@/server/auth/response";
import { testLLMProvider, type LLMProviderTestInput } from "@/server/cryden/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.enum(["anthropic", "openai-compatible"]),
  model: z.string().trim().min(1).max(200),
  api_key: z.string().max(4096).optional(),
  base_url: z.string().max(2048).optional(),
  max_tokens: z.number().int().min(256).max(8192),
  temperature: z.number().min(0).max(2),
  rpm: z.number().int().min(1).max(10000),
});

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return authorized.respond(jsonError(400, "invalid_request", "Provider settings are invalid."));
  try {
    return authorized.respond(
      jsonOk(
        await testLLMProvider({
          token: authorized.session.api.accessToken,
          input: parsed.data as LLMProviderTestInput,
        }),
      ),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
