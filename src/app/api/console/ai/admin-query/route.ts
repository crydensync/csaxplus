import { requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { queryAdminAI } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const body: unknown = await request.json().catch(() => null);
  if (
    typeof body !== "object" ||
    body === null ||
    !("question" in body) ||
    typeof body.question !== "string" ||
    body.question.trim() === "" ||
    body.question.length > 500
  ) {
    return authorized.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "Enter a question up to 500 characters."),
    );
  }
  try {
    return authorized.respond(
      jsonOk(
        await queryAdminAI({
          token: authorized.session.api.accessToken,
          question: body.question,
        }),
      ),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
