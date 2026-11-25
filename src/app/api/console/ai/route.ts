import { z } from "zod";

import { requireCsrf } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk } from "@/server/auth/response";
import { askAI } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

const questionSchema = z.object({ question: z.string().trim().min(1).max(500) });

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireCsrf(request);
  if (!authorized.ok) return authorized.response;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return authorized.respond(jsonError(400, "invalid_request", "Send a valid JSON body."));
  }
  const body = questionSchema.safeParse(raw);
  if (!body.success) {
    return authorized.respond(
      jsonError(400, "invalid_request", "Enter a question under 500 characters."),
    );
  }
  try {
    return authorized.respond(
      jsonOk(
        await askAI({ token: authorized.session.api.accessToken, question: body.data.question }),
      ),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
