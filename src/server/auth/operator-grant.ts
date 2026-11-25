import "server-only";

import { responseForFailure } from "./failures";
import { serializeCookie } from "./cookies";
import { ERROR_CODES, jsonError } from "./response";
import {
  SESSION_COOKIE,
  sealSession,
  sessionCookieOptions,
  shouldUseSecureCookie,
} from "./session";
import type { Authorized } from "./guard";
import type { OperatorStepUpPurpose } from "@/server/cryden/admin";
import { consumeOperatorStepUp } from "@/server/cryden/admin";

/** Runs one owner action with its one-use grant and always clears that grant. */
export async function withOperatorGrant(
  authorized: Extract<Authorized, { ok: true }>,
  purpose: OperatorStepUpPurpose,
  work: (grant: string) => Promise<Response>,
): Promise<Response> {
  const grant = authorized.session.operatorGrant;
  if (!grant || grant.purpose !== purpose)
    return authorized.respond(
      jsonError(
        409,
        ERROR_CODES.invalidRequest,
        "Confirm your passkey before this operator action.",
      ),
    );
  let response: Response;
  try {
    response = await work(grant.token);
  } catch (error) {
    response = responseForFailure(error);
  }
  response = authorized.respond(response);
  response.headers.append(
    "set-cookie",
    serializeCookie(
      SESSION_COOKIE,
      await sealSession({ ...authorized.session, operatorGrant: null, operatorStepUp: null }),
      sessionCookieOptions(shouldUseSecureCookie()),
    ),
  );
  return response;
}

export async function withSecretGrant(
  authorized: Extract<Authorized, { ok: true }>,
  purpose: "secret_reveal" | "secret_mutation",
  work: () => Promise<Response>,
): Promise<Response> {
  const grant = authorized.session.operatorGrant;
  if (!grant || grant.purpose !== purpose) {
    return authorized.respond(
      jsonError(409, ERROR_CODES.invalidRequest, "Confirm your passkey before this secret action."),
    );
  }
  let response: Response;
  try {
    await consumeOperatorStepUp({
      token: authorized.session.api.accessToken,
      grant: grant.token,
      purpose,
    });
    response = await work();
  } catch (error) {
    response = responseForFailure(error);
  }
  response = authorized.respond(response);
  response.headers.append(
    "set-cookie",
    serializeCookie(
      SESSION_COOKIE,
      await sealSession({ ...authorized.session, operatorGrant: null, operatorStepUp: null }),
      sessionCookieOptions(shouldUseSecureCookie()),
    ),
  );
  return response;
}
