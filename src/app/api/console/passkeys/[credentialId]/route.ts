import { z } from "zod";

import { responseForFailure } from "@/server/auth/failures";
import { requireMutation } from "@/server/auth/guard";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { readJsonBody } from "@/server/auth/routes";
import { isCredentialIdSegment, removePasskey } from "@/server/cryden/passkeys";

/**
 * `DELETE /api/console/passkeys/{credentialID}`: removes one of the operator's
 * own passkeys.
 *
 * The credential id comes from the API's own list, which encodes it as base64url
 * with padding, so `=` is part of the value and not path syntax. It is checked
 * here rather than assumed: an id that is not that alphabet would become a
 * different URL rather than a missing credential, and the API refuses a path
 * segment it cannot decode with a 401 that says nothing useful.
 *
 * The body carries the operator's current password, because the API requires it:
 * removing a credential is re-confirmed the way disabling a second factor is
 * (`cryden/auth/webauthn.go:176`). The console does not check the password, does
 * not keep it, and never writes it down; it is forwarded and forgotten.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /**
   * Bounded but never trimmed: a leading or trailing space is part of a password,
   * and the console is not the thing that decides what one may be.
   */
  password: z.string().min(1).max(1024),
});

export async function DELETE(
  request: Request,
  context: { params: Promise<{ credentialId: string }> },
): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;

  const params = await context.params;
  if (!isCredentialIdSegment(params.credentialId)) {
    return authorized.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "That is not a passkey the API issued."),
    );
  }

  const body = await readJsonBody(request, bodySchema);
  if (!body.ok) return authorized.respond(body.response);

  try {
    await removePasskey({
      token: authorized.session.api.accessToken,
      credentialId: params.credentialId,
      password: body.value.password,
    });
  } catch (error) {
    // A wrong password arrives as the API's `invalid_credentials` with its own
    // wording, which is what the operator needs to read.
    return authorized.respond(responseForFailure(error));
  }

  return authorized.respond(jsonOk({ removed: true }));
}
