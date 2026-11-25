import { requireAdmin, requireMutation } from "@/server/auth/guard";
import { jsonError, jsonOk } from "@/server/auth/response";
import { responseForFailure } from "@/server/auth/failures";
import { readWebhookDeliveries } from "@/server/webhooks/report";
import type { WebhookStatus } from "@/server/cryden/admin";
import {
  clearWebhookEndpoint,
  fetchWebhookEndpoint,
  queueWebhookTest,
  saveWebhookEndpoint,
} from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

const statuses: WebhookStatus[] = ["pending", "in_flight", "delivered", "failed"];

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  const params = new URL(request.url).searchParams;
  if (params.get("view") === "endpoint") {
    try {
      return authorized.respond(
        jsonOk(await fetchWebhookEndpoint({ token: authorized.session.api.accessToken })),
      );
    } catch (error) {
      return authorized.respond(responseForFailure(error));
    }
  }
  const rawStatus = params.get("status") ?? "";
  if (rawStatus !== "" && !statuses.includes(rawStatus as WebhookStatus)) {
    return authorized.respond(jsonError(400, "invalid_request", "Choose a valid delivery status."));
  }
  const report = await readWebhookDeliveries({
    token: authorized.session.api.accessToken,
    status: rawStatus === "" ? undefined : (rawStatus as WebhookStatus),
  });
  return authorized.respond(jsonOk(report));
}

export async function PUT(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const body: unknown = await request.json().catch(() => null);
  if (
    typeof body !== "object" ||
    body === null ||
    !("url" in body) ||
    typeof body.url !== "string" ||
    ("secret" in body && typeof body.secret !== "string")
  ) {
    return authorized.respond(
      jsonError(400, "invalid_request", "Enter a valid webhook URL and signing secret."),
    );
  }
  const input = body as { url: string; secret?: string };
  try {
    return authorized.respond(
      jsonOk(
        await saveWebhookEndpoint({
          token: authorized.session.api.accessToken,
          url: input.url,
          secret: input.secret,
        }),
      ),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  try {
    return authorized.respond(
      jsonOk(await clearWebhookEndpoint({ token: authorized.session.api.accessToken })),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  try {
    return authorized.respond(
      jsonOk(await queueWebhookTest({ token: authorized.session.api.accessToken })),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
