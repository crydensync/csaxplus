import { requireAdmin, requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk } from "@/server/auth/response";
import { fetchLLMProvider, saveLLMProvider } from "@/server/cryden/admin";
import { z } from "zod";

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

const inputSchema = z.object({
  kind: z.enum(["anthropic", "openai-compatible"]),
  model: z.string().trim().min(1).max(200),
  api_key: z.string().min(1).max(4096),
  base_url: z.string().max(2048).optional(),
  max_tokens: z.number().int().min(256).max(8192),
  temperature: z.number().min(0).max(2),
  rpm: z.number().int().min(1).max(10000),
});

export async function PUT(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const body: unknown = await request.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success)
    return authorized.respond(jsonError(400, "invalid_request", "Provider settings are invalid."));
  try {
    return authorized.respond(
      jsonOk(
        await saveLLMProvider({ token: authorized.session.api.accessToken, input: parsed.data }),
      ),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
