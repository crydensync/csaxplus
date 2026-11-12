import { requireAdmin, requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { fetchJWTClaims, previewJWTClaims, saveJWTClaims } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  try {
    return authorized.respond(jsonOk(await fetchJWTClaims({ token: authorized.session.api.accessToken })));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

export async function PUT(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("mappings" in body) || !Array.isArray(body.mappings) ||
      !body.mappings.every((item) => typeof item === "object" && item !== null &&
        "claim" in item && typeof item.claim === "string" && "source" in item && typeof item.source === "string")) {
    return authorized.respond(jsonError(400, ERROR_CODES.invalidRequest, "Provide a list of claim and source mappings."));
  }
  try {
    return authorized.respond(jsonOk(await saveJWTClaims({
      token: authorized.session.api.accessToken,
      mappings: body.mappings as { claim: string; source: string }[],
    })));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("user_id" in body) || typeof body.user_id !== "string" || body.user_id.trim() === "") {
    return authorized.respond(jsonError(400, ERROR_CODES.invalidRequest, "Enter an account ID for the preview."));
  }
  try {
    return authorized.respond(jsonOk(await previewJWTClaims({ token: authorized.session.api.accessToken, userId: body.user_id })));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
