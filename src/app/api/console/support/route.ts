import { z } from "zod";

import { requireAdmin } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { fetchSupportDiagnosis } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  const email = new URL(request.url).searchParams.get("email")?.trim() ?? "";
  const parsed = z.string().email().safeParse(email);
  if (!parsed.success) {
    return authorized.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "Enter the exact email address of the account."),
    );
  }
  try {
    const diagnosis = await fetchSupportDiagnosis({
      token: authorized.session.api.accessToken,
      email: parsed.data,
    });
    return authorized.respond(jsonOk(diagnosis));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
