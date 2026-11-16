import { requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk } from "@/server/auth/response";
import { removeWebhookEndpoint, updateWebhookEndpoint } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ endpointID: string }> };

export async function PUT(request: Request, context: Context): Promise<Response> {
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
    ("secret" in body && typeof body.secret !== "string")
  ) {
    return authorized.respond(
      jsonError(400, "invalid_request", "Enter a destination name and HTTPS URL."),
    );
  }
  const input = body as { name: string; url: string; secret?: string };
  try {
    const { endpointID } = await context.params;
    const endpoint = await updateWebhookEndpoint({
      token: authorized.session.api.accessToken,
      id: endpointID,
      name: input.name,
      url: input.url,
      secret: input.secret,
    });
    return authorized.respond(jsonOk(endpoint));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  try {
    const { endpointID } = await context.params;
    await removeWebhookEndpoint({ token: authorized.session.api.accessToken, id: endpointID });
    return authorized.respond(jsonOk({ removed: true }));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
