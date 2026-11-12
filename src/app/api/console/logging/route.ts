import { requireAdmin } from "@/server/auth/guard";
import { jsonError, jsonOk } from "@/server/auth/response";
import { readShippedLogs } from "@/server/logging/report";

export const dynamic = "force-dynamic";

const levels = new Set(["debug", "info", "warn", "error"]);

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  const rawLevel = new URL(request.url).searchParams.get("level") ?? "";
  if (rawLevel !== "" && !levels.has(rawLevel)) {
    return authorized.respond(jsonError(400, "invalid_request", "Choose a valid log level."));
  }
  const report = await readShippedLogs({
    token: authorized.session.api.accessToken,
    level: rawLevel || undefined,
  });
  return authorized.respond(jsonOk(report));
}
