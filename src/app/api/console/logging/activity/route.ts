import { requireAdmin } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { readConsoleActivity } from "@/server/logging/activity";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  const params = new URL(request.url).searchParams;
  const action = params.get("action")?.trim() ?? "";
  const limit = readBoundedInt(params.get("limit"), 50, 1, 100);
  const offset = readBoundedInt(params.get("offset"), 0, 0, 100_000);
  if (action.length > 80 || limit === null || offset === null) {
    return authorized.respond(
      jsonError(
        400,
        ERROR_CODES.invalidRequest,
        "Choose a valid action filter, limit, and offset.",
      ),
    );
  }
  try {
    return authorized.respond(
      jsonOk(await readConsoleActivity({ action: action || undefined, limit, offset })),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

function readBoundedInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}
