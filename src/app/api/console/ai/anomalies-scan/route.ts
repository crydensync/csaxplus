import { requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { scanAdminAnomalies } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

const windows = ["1h", "24h", "7d", "30d"] as const;

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const body: unknown = await request.json().catch(() => null);
  if (
    typeof body !== "object" ||
    body === null ||
    !("since" in body) ||
    typeof body.since !== "string" ||
    !windows.includes(body.since as (typeof windows)[number])
  ) {
    return authorized.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "Choose a supported time window."),
    );
  }
  try {
    return authorized.respond(
      jsonOk(
        await scanAdminAnomalies(
          authorized.session.api.accessToken,
          body.since as (typeof windows)[number],
        ),
      ),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
