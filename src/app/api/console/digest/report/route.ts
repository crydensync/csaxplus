import { requireAdmin } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { fetchDigestReport } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  try {
    const rawWindow = new URL(request.url).searchParams.get("window_days");
    const windowDays = rawWindow === null ? 7 : Number(rawWindow);
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) {
      return authorized.respond(
        jsonError(400, ERROR_CODES.invalidRequest, "Choose a window from 1 to 365 days."),
      );
    }
    return authorized.respond(
      jsonOk(
        await fetchDigestReport({
          token: authorized.session.api.accessToken,
          windowDays,
        }),
      ),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
