import "server-only";

import { z } from "zod";

import { CrydenError, apiRequest } from "./http";

/**
 * The operator's own passkeys, as the API holds them.
 *
 * Separate from `client.ts` and `admin.ts` for the reason `admin.ts` gives: every
 * call here takes an operator token, and no fixture can produce one. The other
 * half of the reason is whose credential this is. A passkey registered here
 * belongs to the operator's account *at the API*, not to this console, so it
 * outlives the console and works for anything else built on the same API. That is
 * the whole point of storing it there rather than in the console's own store.
 *
 * The four calls are the API's own (`api/httpapi/passkey_handlers.go`,
 * `PasskeyHandlers`). Nothing here decides anything: the API verifies the
 * ceremony and answers with its own code and message, which arrive as a
 * `CrydenError`.
 */

export const PASSKEYS_PATH = "/v1/passkeys";
export const REGISTER_BEGIN_PATH = `${PASSKEYS_PATH}/register/begin`;
export const REGISTER_FINISH_PATH = `${PASSKEYS_PATH}/register/finish`;

/**
 * One credential's path.
 *
 * The id is base64 *with* padding, because cryden encodes it with
 * `base64.URLEncoding` (`cryden.go:328`), so `=` is part of the value rather than
 * path syntax. It is escaped here so a caller cannot forget to.
 */
export function passkeyPath(credentialId: string): string {
  return `${PASSKEYS_PATH}/${encodeURIComponent(credentialId)}`;
}

/**
 * Whether a credential id can go in a path segment.
 *
 * The alphabet is base64url plus the padding `=`; the length is bounded because
 * the WebAuthn spec caps a credential id at 1023 bytes, which is 1368 characters
 * once encoded, and nothing longer is an id this API issued. Like
 * `isUserIdSegment`, this is about what may become path syntax, not about whether
 * the credential exists: the API answers that.
 */
export function isCredentialIdSegment(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,1368}={0,2}$/.test(value);
}

/** Raised when the API answered, in the envelope, with a shape this console cannot read. */
function malformed(what: string, path: string): CrydenError {
  return new CrydenError(
    "malformed",
    `the API answered ${path} with a shape this console does not recognise, so ${what} cannot be shown`,
  );
}

// ---------------------------------------------------------------------------
// GET /v1/passkeys
// ---------------------------------------------------------------------------

/**
 * One registered credential.
 *
 * `credential_id` is the identifier for everything else here: the API exposes no
 * separate row id, because the credential id is what cryden stores and what the
 * authenticator knows. `last_used_at` is absent rather than null when the key has
 * never been used, which is the API's `omitempty`.
 */
const passkeySchema = z.object({
  credential_id: z.string().min(1),
  nickname: z.string(),
  created_at: z.string(),
  last_used_at: z.string().optional(),
});

const passkeyListSchema = z.array(passkeySchema);

export type ApiPasskey = z.infer<typeof passkeySchema>;

/**
 * The caller's own passkeys. Always an array: the API builds it with
 * `make([]passkeyDTO, 0, ...)`, so an operator with none gets `[]` rather than
 * null, and the screen's empty state is the same shape as its list.
 */
export async function fetchPasskeys(options: { token: string }): Promise<ApiPasskey[]> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: PASSKEYS_PATH,
    token: options.token,
  });

  const parsed = passkeyListSchema.safeParse(data);
  if (!parsed.success) throw malformed("your passkeys", PASSKEYS_PATH);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// POST /v1/passkeys/register/begin
// ---------------------------------------------------------------------------

/**
 * The creation options as they come back wrapped.
 *
 * cryden returns the whole `CredentialCreation` envelope, not the options inside
 * it: the handler marshals a `*protocol.CredentialCreation`
 * (`cryden/auth/webauthn.go:90`), whose one field is `publicKey`
 * (`go-webauthn/webauthn/protocol/options.go:8`). The browser's
 * `startRegistration` wants the inner object, so this is where it is unwrapped.
 *
 * Done here rather than left to the browser so that a shape the console cannot
 * read is a named failure from this module, rather than a WebAuthn call that
 * fails with nothing useful to say.
 */
const beginSchema = z.object({
  public_key: z.object({ publicKey: z.record(z.string(), z.unknown()) }),
  ceremony_token: z.string().min(1),
});

export type RegistrationOffer = {
  /** The creation options, unwrapped, as the browser's WebAuthn call wants them. */
  options: Record<string, unknown>;
  /** Opaque to this console. It goes back verbatim to `finishRegistration`. */
  ceremonyToken: string;
};

/** Starts an enrolment. The API's token identifies whose, so nothing else is sent. */
export async function beginRegistration(options: { token: string }): Promise<RegistrationOffer> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: REGISTER_BEGIN_PATH,
    token: options.token,
  });

  const parsed = beginSchema.safeParse(data);
  if (!parsed.success) throw malformed("the enrolment options", REGISTER_BEGIN_PATH);
  return { options: parsed.data.public_key.publicKey, ceremonyToken: parsed.data.ceremony_token };
}

// ---------------------------------------------------------------------------
// POST /v1/passkeys/register/finish
// ---------------------------------------------------------------------------

/**
 * Completes an enrolment.
 *
 * `credential` is the browser's `RegistrationResponseJSON`, forwarded exactly as
 * it was produced. It is not reshaped or re-checked field by field: the API
 * passes it through to the engine, which verifies it against the ceremony the
 * token names, and that verification is the only check that decides anything.
 * What is checked here is only that it is an object, so a body of the wrong kind
 * fails at this boundary rather than inside the API.
 *
 * The API answers `{"status": "passkey registered"}`, which is not returned: the
 * caller re-reads the list, so what it shows is what the API holds rather than
 * what one response claimed.
 */
export async function finishRegistration(options: {
  token: string;
  ceremonyToken: string;
  credential: Record<string, unknown>;
  nickname: string;
}): Promise<void> {
  await apiRequest<unknown>({
    method: "POST",
    path: REGISTER_FINISH_PATH,
    token: options.token,
    body: {
      ceremony_token: options.ceremonyToken,
      credential: options.credential,
      nickname: options.nickname,
    },
  });
}

// ---------------------------------------------------------------------------
// DELETE /v1/passkeys/{credentialID}
// ---------------------------------------------------------------------------

/**
 * Removes one credential.
 *
 * The password is the API's requirement, not this console's: `DeletePasskey`
 * re-confirms with it (`cryden.go:337`), the same way disabling TOTP does. The
 * console has no way to spare the operator it, so the screen asks. Nothing here
 * logs it, and `apiRequest` does not either.
 */
export async function removePasskey(options: {
  token: string;
  credentialId: string;
  password: string;
}): Promise<void> {
  await apiRequest<unknown>({
    method: "DELETE",
    path: passkeyPath(options.credentialId),
    token: options.token,
    body: { password: options.password },
  });
}
