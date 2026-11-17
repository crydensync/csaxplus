import "server-only";

import { z } from "zod";

import {
  SECOND_FACTOR_METHODS,
  isSecondFactorMethod,
  type SecondFactorMethod,
} from "@/lib/second-factor";

import { CrydenError, apiRequest } from "../cryden/http";

/**
 * The API's authentication surface, as the console uses it: the shapes are
 * checked on the way in, so a change on the API's side surfaces here as a clear
 * failure rather than as a screen quietly reading a field that is no longer
 * there.
 *
 * Every path and body here was read from the API's own router and handlers
 * (`httpapi/router.go`, `auth_handlers.go`, `totp_handlers.go`,
 * `passkey_handlers.go`, `recovery_handlers.go`, `session_handlers.go`).
 */

export { SECOND_FACTOR_METHODS, isSecondFactorMethod };
export type { SecondFactorMethod };

export type ApiTokens = {
  accessToken: string;
  refreshToken: string;
};

/** A correct password that is not yet a session: the API wants a second factor. */
export type PausedLogin = {
  pendingToken: string;
  methods: SecondFactorMethod[];
};

export type SignInResult =
  { kind: "tokens"; tokens: ApiTokens } | { kind: "second-factor"; paused: PausedLogin };

/** A session the API has on record for this account. */
export type NamedSession = {
  id: string;
  label: string;
  createdAt: string;
  userAgent: string;
  ip: string;
};

export type PasskeyChallenge = {
  /** `PublicKeyCredentialRequestOptions`, passed through to the browser as it arrived. */
  options: Record<string, unknown>;
  ceremonyToken: string;
};

const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
});

const pausedSchema = z.object({
  second_factor_required: z.literal(true),
  pending_token: z.string().min(1),
  methods: z.array(z.string()),
});

const passkeyChallengeSchema = z.object({
  public_key: z.object({ publicKey: z.record(z.string(), z.unknown()) }),
  ceremony_token: z.string().min(1),
});

const namedSessionSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  created_at: z.string().min(1),
  user_agent: z.string(),
  ip: z.string(),
});

const apiKeySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  prefix: z.string().min(1),
  scopes: z.array(z.string()),
  expires_at: z.string().datetime({ offset: true }).nullable(),
  expired: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
  last_used_at: z.string().datetime({ offset: true }).nullable(),
});

export type ApiKeyRecord = z.infer<typeof apiKeySchema>;

const createdApiKeySchema = z.object({
  key: z.string().min(1),
  notice: z.string().min(1),
  api_key: apiKeySchema,
});

export type CreatedApiKey = z.infer<typeof createdApiKeySchema>;

function shapeFailure(what: string): CrydenError {
  return new CrydenError("malformed", `the API's ${what} answer was not in the expected shape`);
}

function toTokens(data: unknown): ApiTokens {
  const parsed = tokensSchema.safeParse(data);
  if (!parsed.success) throw shapeFailure("token");
  return { accessToken: parsed.data.access_token, refreshToken: parsed.data.refresh_token };
}

/**
 * The methods the API offered, narrowed to the three it can actually return.
 *
 * A method the console does not know would leave the operator staring at a
 * choice it cannot complete, so an answer made only of unknown methods is a
 * failure rather than an empty list.
 */
function toMethods(raw: readonly string[]): SecondFactorMethod[] {
  const known = raw.filter(isSecondFactorMethod);
  if (known.length === 0 && raw.length > 0) throw shapeFailure("second factor");
  return known;
}

/** `POST /v1/login`. A correct password may answer with tokens or with a pause. */
export async function signInWithPassword(
  email: string,
  password: string,
  userAgent = "",
): Promise<SignInResult> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: "/v1/login",
    body: { email, password },
    userAgent,
  });

  const paused = pausedSchema.safeParse(data);
  if (paused.success) {
    return {
      kind: "second-factor",
      paused: {
        pendingToken: paused.data.pending_token,
        methods: toMethods(paused.data.methods),
      },
    };
  }
  return { kind: "tokens", tokens: toTokens(data) };
}

/** `POST /v1/login/totp`. */
export async function completeTotp(
  pendingToken: string,
  code: string,
  userAgent = "",
): Promise<ApiTokens> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: "/v1/login/totp",
    body: { pending_token: pendingToken, code },
    userAgent,
  });
  return toTokens(data);
}

/** `POST /v1/login/recovery-code`. Consumes one of the account's recovery codes. */
export async function completeRecoveryCode(
  pendingToken: string,
  code: string,
  userAgent = "",
): Promise<ApiTokens> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: "/v1/login/recovery-code",
    body: { pending_token: pendingToken, code },
    userAgent,
  });
  return toTokens(data);
}

/** `POST /v1/login/passkey/begin`. Returns the challenge the browser signs. */
export async function beginPasskey(pendingToken: string): Promise<PasskeyChallenge> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: "/v1/login/passkey/begin",
    body: { pending_token: pendingToken },
  });

  const parsed = passkeyChallengeSchema.safeParse(data);
  if (!parsed.success) throw shapeFailure("passkey challenge");
  // CSAG serializes CredentialAssertion with a publicKey wrapper, while the
  // browser helper accepts the request options inside that wrapper.
  return {
    options: parsed.data.public_key.publicKey,
    ceremonyToken: parsed.data.ceremony_token,
  };
}

/** `POST /v1/login/passkey/finish`. `credential` is the browser's response, passed through. */
export async function finishPasskey(
  pendingToken: string,
  ceremonyToken: string,
  credential: unknown,
): Promise<ApiTokens> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: "/v1/login/passkey/finish",
    body: { pending_token: pendingToken, ceremony_token: ceremonyToken, credential },
  });
  return toTokens(data);
}

/**
 * `POST /v1/refresh`. The API rotates the refresh token on every call and
 * revokes the one presented, so the caller must store what comes back.
 */
export async function refreshTokens(refreshToken: string): Promise<ApiTokens> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: "/v1/refresh",
    body: { refresh_token: refreshToken },
  });
  return toTokens(data);
}

/** `POST /v1/logout`. Revokes one session, and only one this account owns. */
export async function revokeSession(sessionId: string, accessToken: string): Promise<void> {
  await apiRequest<unknown>({
    method: "POST",
    path: "/v1/logout",
    body: { session_id: sessionId },
    token: accessToken,
  });
}

/** `GET /v1/sessions`. The account's sessions, newest first is not guaranteed. */
export async function listSessions(accessToken: string): Promise<NamedSession[]> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: "/v1/sessions",
    token: accessToken,
  });

  const parsed = z.array(namedSessionSchema).safeParse(data);
  if (!parsed.success) throw shapeFailure("session list");
  return parsed.data.map((session) => ({
    id: session.id,
    label: session.label,
    createdAt: session.created_at,
    userAgent: session.user_agent,
    ip: session.ip,
  }));
}

/** `GET /v1/api-keys`. Keys are scoped to the signed-in account. */
export async function listApiKeys(accessToken: string): Promise<ApiKeyRecord[]> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: "/v1/api-keys",
    token: accessToken,
  });
  const parsed = z.array(apiKeySchema).safeParse(data);
  if (!parsed.success) throw shapeFailure("API key list");
  return parsed.data;
}

/** `POST /v1/api-keys`. The raw key is returned once and never stored by the console. */
export async function createApiKey(
  accessToken: string,
  name: string,
  expiresInDays: number,
): Promise<CreatedApiKey> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: "/v1/api-keys",
    token: accessToken,
    body: { name, scopes: [], expires_in_days: expiresInDays },
  });
  const parsed = createdApiKeySchema.safeParse(data);
  if (!parsed.success) throw shapeFailure("new API key");
  return parsed.data;
}

/** `DELETE /v1/api-keys/{keyID}`. Ownership is checked by the API. */
export async function revokeApiKey(accessToken: string, keyID: string): Promise<void> {
  await apiRequest<unknown>({
    method: "DELETE",
    path: `/v1/api-keys/${encodeURIComponent(keyID)}`,
    token: accessToken,
  });
}
