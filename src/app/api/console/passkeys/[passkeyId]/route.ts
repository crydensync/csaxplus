import { z } from "zod";

import { requireSession, requireStepUp } from "@/server/auth/guard";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { getConsoleStore } from "@/server/db/index";
import { countPasskeys, deletePasskey } from "@/server/store/passkeys";

/**
 * `DELETE /api/console/passkeys/{id}`: removes one of the operator's own step-up
 * passkeys.
 *
 * Gated on a step-up, unlike registering the first one. Removing a second factor
 * is exactly the change a stolen session would want to make, since it leaves the
 * account with only the password the thief already has. Adding a passkey is
 * gated for the same reason, and the first one is not gated only because there
 * is no way to gate it.
 *
 * The id is checked as a uuid before it reaches a statement. The column is
 * `uuid` on Postgres and `text` on SQLite, so a hand-written id would be a
 * perfectly good value on one engine and a database error on the other; refusing
 * it here means both engines answer the same 400.
 */

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ passkeyId: z.uuid() });

export async function DELETE(
  request: Request,
  context: { params: Promise<{ passkeyId: string }> },
): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return authorized.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "That is not a passkey this console issued."),
    );
  }

  const gated = await requireStepUp(authorized, request, "passkey.remove");
  if (!gated.ok) return gated.response;

  const store = getConsoleStore();
  const operatorId = gated.session.operator.id;
  const removed = await deletePasskey(store.driver, operatorId, params.data.passkeyId);

  if (!removed) {
    // Two things land here and they want different words. Either the operator
    // holds only this one passkey, in which case removing it would lock them out
    // of every operation that needs a step-up, or it was never theirs to remove.
    const held = await countPasskeys(store.driver, operatorId);
    return gated.respond(
      held <= 1
        ? jsonError(
            409,
            ERROR_CODES.conflict,
            "This is your only passkey. Add another before removing this one.",
          )
        : jsonError(404, ERROR_CODES.notFound, "That passkey is not one of yours."),
    );
  }

  return gated.respond(jsonOk({ removed: params.data.passkeyId }));
}
