import { requireAdmin, requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk } from "@/server/auth/response";
import { fetchAskAIWidget, saveAskAIWidget } from "@/server/cryden/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  try {
    return authorized.respond(
      jsonOk(await fetchAskAIWidget({ token: authorized.session.api.accessToken })),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

const inputSchema = z.object({
  enabled: z.boolean(),
  allowed_origins: z.array(z.string().max(512)).max(20),
  entities: z.array(z.enum(["users", "sessions", "audit_events"])).max(8),
  greeting: z.string().max(200),
  placeholder: z.string().max(200),
});

export async function PUT(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return authorized.respond(
      jsonError(400, "invalid_request", "Check the widget fields and try again."),
    );
  }
  try {
    return authorized.respond(
      jsonOk(
        await saveAskAIWidget({
          token: authorized.session.api.accessToken,
          input: parsed.data,
        }),
      ),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
