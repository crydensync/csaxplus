import { z } from "zod";

import { requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk } from "@/server/auth/response";
import { reviewAnomaly } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  status: z.enum(["unreviewed", "confirmed", "dismissed"]),
  note: z.string().max(500),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ eventID: string }> },
): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return authorized.respond(jsonError(400, "invalid_request", "Send a valid JSON body."));
  }
  const body = reviewSchema.safeParse(raw);
  if (!body.success) {
    return authorized.respond(
      jsonError(
        400,
        "invalid_request",
        "Choose a review status and enter a note under 500 characters.",
      ),
    );
  }
  const { eventID } = await context.params;
  try {
    const review = await reviewAnomaly({
      token: authorized.session.api.accessToken,
      eventID,
      status: body.data.status,
      note: body.data.note,
    });
    return authorized.respond(jsonOk(review));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
