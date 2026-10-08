import "server-only";

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";

/**
 * What the browser sends back from an authenticator, checked and then shaped for
 * the WebAuthn library.
 *
 * Two things happen here and they are different jobs. The schema bounds the
 * body: every field is a string of a length this console is willing to hold, so
 * a request that is merely enormous is refused before the library has to make
 * sense of it. The library is then the authority on whether the bytes are a
 * credential at all, and nothing here tries to pre-empt it by validating a
 * signature or a structure it cannot check.
 *
 * The `to*` functions build the library's shape field by field rather than
 * casting the parsed body into it. That is what makes dropping
 * `clientExtensionResults` a decision rather than an accident: this console
 * asks for no extensions, so an authenticator's output for one is not something
 * it knows how to act on, and passing it along would suggest otherwise.
 */

/**
 * Long enough for an attestation object from any authenticator this console will
 * meet, and short enough that the whole body stays under the 64 KiB a JSON body
 * is allowed.
 */
const BASE64URL_MAX = 16_384;

const base64url = z.string().min(1).max(BASE64URL_MAX);
const transports = z.array(z.string().min(1).max(32)).max(8).default([]);

export const registrationResponseSchema = z.object({
  id: base64url,
  rawId: base64url,
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: base64url,
    attestationObject: base64url,
    transports,
  }),
});

export type RegistrationResponseBody = z.infer<typeof registrationResponseSchema>;

export function toRegistrationResponse(body: RegistrationResponseBody): RegistrationResponseJSON {
  return {
    id: body.id,
    rawId: body.rawId,
    type: body.type,
    clientExtensionResults: {},
    response: {
      clientDataJSON: body.response.clientDataJSON,
      attestationObject: body.response.attestationObject,
      transports: body.response.transports,
    },
  };
}

export const authenticationResponseSchema = z.object({
  id: base64url,
  rawId: base64url,
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: base64url,
    authenticatorData: base64url,
    signature: base64url,
    userHandle: base64url.optional(),
  }),
});

export type AuthenticationResponseBody = z.infer<typeof authenticationResponseSchema>;

export function toAuthenticationResponse(
  body: AuthenticationResponseBody,
): AuthenticationResponseJSON {
  return {
    id: body.id,
    rawId: body.rawId,
    type: body.type,
    clientExtensionResults: {},
    response: {
      clientDataJSON: body.response.clientDataJSON,
      authenticatorData: body.response.authenticatorData,
      signature: body.response.signature,
      ...(body.response.userHandle === undefined ? {} : { userHandle: body.response.userHandle }),
    },
  };
}
