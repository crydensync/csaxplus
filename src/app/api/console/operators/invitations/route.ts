import { z } from "zod";

import { requireOwnerMutation } from "@/server/auth/guard";
import { withOperatorGrant } from "@/server/auth/operator-grant";
import { readJsonBody } from "@/server/auth/routes";
import { jsonOk } from "@/server/auth/response";
import { responseForFailure } from "@/server/auth/failures";
import { createOperatorInvitation } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["admin", "viewer"]),
});

export async function POST(request: Request): Promise<Response> {
  const auth = await requireOwnerMutation(request);
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, schema);
  if (!body.ok) return auth.respond(body.response);
  return withOperatorGrant(auth, "operator_invite", async (grant) => {
    try {
      return jsonOk(
        await createOperatorInvitation({
          token: auth.session.api.accessToken,
          grant,
          email: body.value.email,
          role: body.value.role,
        }),
        { status: 201 },
      );
    } catch (error) {
      return responseForFailure(error);
    }
  });
}
