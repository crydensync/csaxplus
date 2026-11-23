import { z } from "zod";

import { requireCsrf } from "@/server/auth/guard";
import { readJsonBody } from "@/server/auth/routes";
import { jsonOk } from "@/server/auth/response";
import { responseForFailure } from "@/server/auth/failures";
import { acceptOperatorInvitation } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";
const schema = z.object({ token: z.string().min(32).max(64) });

export async function POST(request: Request): Promise<Response> {
  // Invited users are not operators yet, so the normal mutation role check
  // would block the very request that grants their first console role.
  const auth = await requireCsrf(request);
  if (!auth.ok) return auth.response;
  const body = await readJsonBody(request, schema);
  if (!body.ok) return auth.respond(body.response);
  try {
    const result = await acceptOperatorInvitation({
      token: auth.session.api.accessToken,
      invitationToken: body.value.token,
    });
    return auth.respond(jsonOk(result));
  } catch (error) {
    return auth.respond(responseForFailure(error));
  }
}
