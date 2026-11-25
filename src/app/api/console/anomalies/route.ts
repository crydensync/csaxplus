import { z } from "zod";

import { requireAdmin } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk } from "@/server/auth/response";
import { fetchAnomalies, type AnomalyStatus } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(["unreviewed", "confirmed", "dismissed"]);

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit") ?? 25);
  const offset = Number(params.get("offset") ?? 0);
  const rawStatus = params.get("status");
  const status = rawStatus === null ? undefined : statusSchema.safeParse(rawStatus);
  if (status !== undefined && !status.success) {
    return authorized.respond(jsonError(400, "invalid_request", "Choose a valid review status."));
  }
  try {
    const result = await fetchAnomalies({
      token: authorized.session.api.accessToken,
      limit,
      offset,
      status: status?.success ? (status.data as AnomalyStatus) : undefined,
    });
    return authorized.respond(jsonOk(result));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
