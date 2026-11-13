import { z } from "zod";

import { requireAdmin, requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { fetchDigestSchedule, saveDigestSchedule } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

const scheduleSchema = z.object({
  enabled: z.boolean(),
  day_of_week: z.enum([
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).max(64),
  recipients: z.array(z.string().email()).max(20),
  delivery_enabled: z.boolean(),
});

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  try {
    return authorized.respond(
      jsonOk(await fetchDigestSchedule({ token: authorized.session.api.accessToken })),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

export async function PUT(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const body: unknown = await request.json().catch(() => null);
  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return authorized.respond(
      jsonError(
        400,
        ERROR_CODES.invalidRequest,
        "Enter a valid digest schedule and recipient list.",
      ),
    );
  }
  try {
    return authorized.respond(
      jsonOk(
        await saveDigestSchedule({
          token: authorized.session.api.accessToken,
          settings: parsed.data,
        }),
      ),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
