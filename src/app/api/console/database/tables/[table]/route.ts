import { requireAdmin } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { fetchDatabaseRows } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ table: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  const { table } = await context.params;
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(table)) {
    return authorized.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "Choose a valid table name."),
    );
  }
  const query = new URL(request.url).searchParams;
  const limit = readBoundedInt(query.get("limit"), 25, 1, 100);
  const offset = readBoundedInt(query.get("offset"), 0, 0, 100_000);
  if (limit === null || offset === null) {
    return authorized.respond(
      jsonError(
        400,
        ERROR_CODES.invalidRequest,
        "Choose a limit up to 100 and an offset up to 100000.",
      ),
    );
  }
  try {
    const rows = await fetchDatabaseRows({
      token: authorized.session.api.accessToken,
      table,
      limit,
      offset,
    });
    return authorized.respond(jsonOk(rows));
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
