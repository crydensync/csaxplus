import { z } from "zod";

import { requireMutation, requireSession } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk } from "@/server/auth/response";
import { createApiKey, listApiKeys } from "@/server/auth/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;
  try {
    const keys = await listApiKeys(authorized.session.api.accessToken);
    return authorized.respond(jsonOk(keys));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

const createSchema = z.object({
  name: z.string().trim().max(100),
  expires_in_days: z.number().int().min(0).max(3650),
});

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return authorized.respond(jsonError(400, "invalid_request", "Send a valid JSON body."));
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return authorized.respond(
      jsonError(
        400,
        "invalid_request",
        "Name must be 100 characters or fewer and expiry must be between 0 and 3650 days.",
      ),
    );
  }
  try {
    const created = await createApiKey(
      authorized.session.api.accessToken,
      parsed.data.name,
      parsed.data.expires_in_days,
    );
    return authorized.respond(jsonOk(created, { status: 201 }));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
