import { requireAdmin, requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { fetchLoggingSettings, saveLoggingSettings } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";
const levels = ["debug", "info", "warn", "error"] as const;

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  try {
    return authorized.respond(jsonOk(await fetchLoggingSettings({ token: authorized.session.api.accessToken })));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

export async function PUT(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("enabled" in body) || typeof body.enabled !== "boolean" ||
      !("min_level" in body) || typeof body.min_level !== "string" || !levels.includes(body.min_level as (typeof levels)[number])) {
    return authorized.respond(jsonError(400, ERROR_CODES.invalidRequest, "Choose whether logging is enabled and a valid minimum level."));
  }
  try {
    return authorized.respond(jsonOk(await saveLoggingSettings({
      token: authorized.session.api.accessToken,
      enabled: body.enabled,
      minLevel: body.min_level as (typeof levels)[number],
    })));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
