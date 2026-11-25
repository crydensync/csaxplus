import { requireAdmin } from "@/server/auth/guard";
import { jsonError, jsonOk } from "@/server/auth/response";
import { readConfigTuning } from "@/server/config-advisor/report";

export const dynamic = "force-dynamic";

const windows = new Set([7, 30, 90, 180, 365]);

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  const raw = new URL(request.url).searchParams.get("window_days") ?? "30";
  const windowDays = Number(raw);
  if (!Number.isInteger(windowDays) || !windows.has(windowDays)) {
    return authorized.respond(
      jsonError(400, "invalid_request", "Choose an evidence window from 7 to 365 days."),
    );
  }
  return authorized.respond(
    jsonOk(await readConfigTuning({ token: authorized.session.api.accessToken, windowDays })),
  );
}
