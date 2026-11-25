import { requireAdmin, requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk } from "@/server/auth/response";
import { createWebhookEndpoint, fetchWebhookEndpoints } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  try {
    return authorized.respond(
      jsonOk(await fetchWebhookEndpoints({ token: authorized.session.api.accessToken })),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const body: unknown = await request.json().catch(() => null);
  if (
    typeof body !== "object" ||
    body === null ||
    !("name" in body) ||
    typeof body.name !== "string" ||
    !("url" in body) ||
    typeof body.url !== "string" ||
    !("secret" in body) ||
    typeof body.secret !== "string"
  ) {
    return authorized.respond(
      jsonError(400, "invalid_request", "Enter a destination name, HTTPS URL, and signing secret."),
    );
  }
  try {
    const endpoint = await createWebhookEndpoint({
      token: authorized.session.api.accessToken,
      name: body.name,
      url: body.url,
      secret: body.secret,
    });
    return authorized.respond(jsonOk(endpoint, { status: 201 }));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
