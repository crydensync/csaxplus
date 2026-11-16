import { requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonOk } from "@/server/auth/response";
import { queueWebhookDestinationTest } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ endpointID: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  try {
    const { endpointID } = await context.params;
    const result = await queueWebhookDestinationTest({
      token: authorized.session.api.accessToken,
      id: endpointID,
    });
    return authorized.respond(jsonOk(result, { status: 202 }));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
