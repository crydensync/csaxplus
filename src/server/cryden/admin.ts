import "server-only";

import { z } from "zod";

import { CrydenError, apiRequest } from "./http";

/**
 * The admin reads the console makes on an operator's behalf.
 *
 * Separate from `client.ts` rather than methods on `CrydenClient`, and the
 * reason is the operator token. Every call here takes one, and a token only
 * exists after a real sign-in against a real API. Fixtures mode cannot sign in
 * (see the fixtures adapter), so there is no sample answer these could return
 * that would not be a fake path to a screen nobody can reach. Putting them on
 * the two-adapter interface would mean writing that fake to satisfy the type.
 *
 * So the rule this module keeps is narrower and stronger: every function here
 * requires a token, and no function here can be reached without one.
 *
 * Each answer is checked with zod before it is used. The API's admin surface is
 * what a screen renders directly, and a field renamed on the API's side should
 * arrive as a named failure in the console rather than as `undefined` on a card.
 */

export const USERS_PATH = "/v1/admin/users";
export const HASH_MIGRATION_PATH = "/v1/admin/security/hash-migration";
export const MFA_ADOPTION_PATH = "/v1/admin/security/mfa-adoption";
export const DIGEST_HISTORY_PATH = "/v1/admin/digest/history";
export const DIGEST_REPORT_PATH = "/v1/admin/digest";
export const DIGEST_SETTINGS_PATH = "/v1/admin/settings/digest";
export const EMAIL_STATS_PATH = "/v1/admin/email/stats";
export const EMAIL_TEMPLATES_PATH = "/v1/admin/settings/email-templates";
export const PASSWORD_POLICY_PATH = "/v1/admin/settings/password-policy";
export const ADMIN_SESSIONS_PATH = "/v1/admin/sessions";
export const ADMIN_ANOMALIES_PATH = "/v1/admin/anomalies";
export const ADMIN_AUDIT_PATH = "/v1/admin/audit";
export const ADMIN_OPERATORS_PATH = "/v1/admin/operators";
export const WEBHOOK_DELIVERIES_PATH = "/v1/admin/webhooks/deliveries";
export const WEBHOOK_ENDPOINT_PATH = "/v1/admin/webhooks";
export const JWT_CLAIMS_PATH = "/v1/admin/settings/jwt-claims";
export const SHIPPED_LOGS_PATH = "/v1/admin/logging/recent";
export const LOGGING_SETTINGS_PATH = "/v1/admin/settings/logging";
export const LLM_PROVIDER_PATH = "/v1/admin/settings/llm-provider";
export const DATABASE_PROVIDER_PATH = "/v1/admin/settings/database-provider";
export const SUPPORT_DIAGNOSE_PATH = "/v1/admin/support/diagnose";
export const CONFIG_TUNING_PATH = "/v1/admin/config-tuning";
export const ASK_AI_WIDGET_PATH = "/v1/admin/settings/ask-ai-widget";
export const ASK_AI_PATH = "/v1/ask-ai";
export const ADMIN_AI_QUERY_PATH = "/v1/admin/ai/query";
export const ADMIN_AI_LOGS_PATH = "/v1/admin/ai/logs";
export const ADMIN_AI_ANOMALIES_PATH = "/v1/admin/ai/anomalies-scan";
export const ADMIN_AI_AUDIT_PATH = "/v1/admin/ai/audit";
export const ADMIN_AI_ASK_PATH = "/v1/admin/ai/ask";
export const SYSTEM_STATS_PATH = "/v1/admin/stats";
export const SYSTEM_DOCTOR_PATH = "/v1/admin/doctor";
export const SYSTEM_MIGRATIONS_PATH = "/v1/admin/migrations/status";

/**
 * One account's own routes. A function rather than a constant because the id is
 * a path segment: `/v1/admin/users/{id}` and `/v1/admin/users/{id}/metadata`.
 *
 * The caller must have already refused an id that is not a plain segment. The
 * route handlers do that, and it is the one thing in this module that depends on
 * a decision made elsewhere, so it is stated rather than assumed.
 */
export function userPath(userId: string): string {
  return `${USERS_PATH}/${userId}`;
}

export function userMetadataPath(userId: string): string {
  return `${userPath(userId)}/metadata`;
}

/**
 * Whether a user id is a plain path segment, and so safe to put in a URL path.
 *
 * This is a check on the way in, not a check on whether the account exists: the
 * API answers that. What it stops is a value from the browser becoming path
 * syntax in the request the console makes on its behalf. An id containing a `/`,
 * a `?`, a `#` or a `..` would not be a bad user id, it would be a different
 * URL, so it is refused here rather than sent.
 *
 * Deliberately narrower than "anything the API would accept": the engine mints
 * these ids itself, the API refuses a path segment that is not a UUID with a
 * 404 before it reaches a query (`looksLikeUUID`), and a console never needs to
 * forward anything wider.
 */
export function isUserIdSegment(value: string): boolean {
  return /^[A-Za-z0-9-]{1,64}$/.test(value);
}

/**
 * How many accounts one page of the Users screen asks for.
 *
 * Twenty-five rather than the dashboard's five: this is a list an operator scans
 * and pages through, and a page short enough to read at a glance is worth more
 * than the one round trip a larger page saves.
 */
export const USERS_PAGE_SIZE = 25;

/**
 * How many of an account's recorded events the detail drawer shows. The API caps
 * this itself (`userActivityLimit`, 20) and ignores anything larger, so this is
 * the console asking for what the API will actually return rather than a second
 * opinion about it.
 */
export const USER_ACTIVITY_LIMIT = 20;

/**
 * How many accounts the dashboard's "newest" panel asks for. The same call
 * returns the total, so this is a display choice rather than a second request.
 */
export const DASHBOARD_USER_LIMIT = 5;

/** How many stored digests the dashboard looks back through. It shows the newest. */
export const DASHBOARD_DIGEST_LIMIT = 1;

/** Raised when the API answered, in the envelope, with a shape this console cannot read. */
function malformed(what: string, path: string): CrydenError {
  return new CrydenError(
    "malformed",
    `the API answered ${path} with a shape this console does not recognise, so ${what} cannot be shown`,
  );
}

// ---------------------------------------------------------------------------
// GET /v1/admin/users
// ---------------------------------------------------------------------------

/**
 * One account, as the API describes it. `locked` is the API's own computation
 * from `locked_until` against its clock, not a mirror of the column: a lockout
 * that has already expired reads as unlocked, which is what an operator needs to
 * see. See `adminUserDTO` in the API.
 */
const adminUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  created_at: z.string(),
  updated_at: z.string(),
  failed_attempts: z.number().int(),
  locked: z.boolean(),
  locked_until: z.string().nullable(),
});

/**
 * The list answer. `match` is "browse" or "exact_email", and it is kept rather
 * than dropped because the dashboard's total means different things depending
 * on it: a browse total is every account, an email match is one.
 *
 * It matters more on the Users screen, where the operator typed the query: the
 * API's email match is exact *and* case-sensitive, so a search that found
 * nothing is usually a search that was spelled differently rather than an
 * account that does not exist. The screen says so, and it can only say so
 * because the API echoes which mode answered.
 */
const userListSchema = z.object({
  users: z.array(adminUserSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
  match: z.string(),
  query: z.string(),
});

export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUserList = z.infer<typeof userListSchema>;

/**
 * A page of accounts, newest first, plus the total. Admin token required.
 *
 * `query` is passed straight through as the API's `q`. It is an exact-email
 * lookup there and nothing else, deliberately: partial search would mean SQL
 * against the engine's own users table from the API layer
 * (`api/httpapi/user_handlers.go`, UserHandlers.List). The console does not work
 * around that, and the screen tells the operator what the search is.
 */
export async function fetchUsers(options: {
  token: string;
  limit?: number;
  offset?: number;
  query?: string;
}): Promise<AdminUserList> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? DASHBOARD_USER_LIMIT));
  if (options.offset !== undefined) params.set("offset", String(options.offset));
  if (options.query !== undefined && options.query !== "") params.set("q", options.query);

  const data = await apiRequest<unknown>({
    method: "GET",
    path: `${USERS_PATH}?${params.toString()}`,
    token: options.token,
  });

  const parsed = userListSchema.safeParse(data);
  if (!parsed.success) throw malformed("the account list", USERS_PATH);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// GET /v1/admin/users/{userID}
// ---------------------------------------------------------------------------

/**
 * One recorded event against an account, as the API returns it.
 *
 * `metadata` is passed through as the engine stored it rather than reshaped: its
 * keys are cryden's, they differ per event type, and a host that renamed them
 * would be inventing a second vocabulary for the engine's own records.
 */
const auditEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  user_id: z.string().optional(),
  email: z.string().email().optional(),
  ip: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  created_at: z.string().datetime({ offset: true }),
});

/**
 * One account's state, its live session count, and its recent history.
 *
 * `active_sessions` is a count and not a list, and the console must not present
 * it as one: the API returns a number deliberately, because listing sessions
 * would publish every address and user agent an account has signed in from to
 * anyone holding an operator token (`api/httpapi/user_handlers.go`,
 * adminUserDetailDTO). The per-account device list is step 2.1's work.
 */
const adminUserDetailSchema = z.object({
  user: adminUserSchema,
  active_sessions: z.number().int(),
  recent_activity: z.array(auditEventSchema),
});

export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;

/** One account's state for the detail drawer. Admin token required. */
export async function fetchUserDetail(options: {
  token: string;
  userId: string;
}): Promise<AdminUserDetail> {
  const path = userPath(options.userId);
  const data = await apiRequest<unknown>({ method: "GET", path, token: options.token });

  const parsed = adminUserDetailSchema.safeParse(data);
  if (!parsed.success) throw malformed("the account", path);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// The admin user actions
// ---------------------------------------------------------------------------

/**
 * The answer every admin user action returns: the account as it stands after the
 * action, so the drawer re-renders from the answer rather than issuing a second
 * GET. `detail` is present only when the action has something worth reporting
 * (how many sessions were revoked, which provider was unlinked). Mirrors
 * `adminActionDTO` in the API.
 */
const adminActionSchema = z.object({
  user: adminUserSchema,
  detail: z.string().optional(),
});

export type AdminActionResult = z.infer<typeof adminActionSchema>;

/** The account actions the console relays. Each is one API endpoint. */
export type UserAction = "unlock" | "suspend" | "unsuspend" | "revoke-sessions" | "mfa-disable";

/**
 * An action's path, or null when the caller passed something that cannot be one.
 *
 * The id is a path segment the browser chose and the same check the detail read
 * makes applies: a value carrying a slash is not a bad account id, it is a
 * different URL. The action names come from this module's own union, so an
 * unknown one is a programming error and is refused rather than mapped to
 * something that looks plausible.
 */
export function userActionPath(userId: string, action: UserAction): string | null {
  if (!isUserIdSegment(userId)) return null;
  const verbs: Record<UserAction, string> = {
    unlock: "unlock",
    suspend: "suspend",
    unsuspend: "unsuspend",
    "revoke-sessions": "revoke-sessions",
    "mfa-disable": "mfa/disable",
  };
  const verb = verbs[action];
  return verb === undefined ? null : `${userPath(userId)}/${verb}`;
}

/** An OAuth unlink's path, under the same segment rule as the user id itself. */
export function userOAuthPath(userId: string, provider: string): string | null {
  if (!isUserIdSegment(userId)) return null;
  // A provider name is lowercase letters, digits and a dash in the engine's
  // configuration (google, github, microsoft, discord, gitlab, apple). Anything
  // else is refused before it becomes path syntax.
  if (!/^[a-z0-9-]{1,32}$/.test(provider)) return null;
  return `${userPath(userId)}/oauth/${provider}`;
}

/**
 * One admin action on an account: unlock, suspend, unsuspend, revoke its
 * sessions, remove its second factor, or unlink one OAuth provider.
 *
 * Every one is a POST or DELETE the API gates behind its own admin check and
 * audits with the operator's id, so the console adds no permission of its own
 * here: a token the API would refuse for these paths fails here exactly as it
 * would anywhere else. The answer is the account as it stands afterwards, which
 * is what the drawer re-renders from.
 */
export async function performUserAction(options: {
  token: string;
  userId: string;
  action: UserAction;
}): Promise<AdminActionResult> {
  const path = userActionPath(options.userId, options.action);
  if (path === null)
    throw new CrydenError("malformed", "that is not an account id the console can act on");
  const data = await apiRequest<unknown>({ method: "POST", path, token: options.token });

  const parsed = adminActionSchema.safeParse(data);
  if (!parsed.success) throw malformed("the account after the action", path);
  return parsed.data;
}

/** Removes one OAuth identity from an account. Admin token required. */
export async function unlinkUserOAuth(options: {
  token: string;
  userId: string;
  provider: string;
}): Promise<AdminActionResult> {
  const path = userOAuthPath(options.userId, options.provider);
  if (path === null)
    throw new CrydenError("malformed", "that is not a provider name the console can send");
  const data = await apiRequest<unknown>({ method: "DELETE", path, token: options.token });

  const parsed = adminActionSchema.safeParse(data);
  if (!parsed.success) throw malformed("the account after the unlink", path);
  return parsed.data;
}

/** Registers a new account on this deployment: POST /v1/admin/users. */
export async function createUser(options: {
  token: string;
  email: string;
  password: string;
}): Promise<AdminUser> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: USERS_PATH,
    token: options.token,
    body: { email: options.email, password: options.password },
  });

  // The action answer carries the account; the create path answers 201 with
  // the same envelope, so one schema reads both.
  const parsed = adminActionSchema.safeParse(data);
  if (!parsed.success) throw malformed("the created account", USERS_PATH);
  return parsed.data.user;
}

// ---------------------------------------------------------------------------
// GET /v1/admin/users/{userID}/metadata
// ---------------------------------------------------------------------------

/**
 * An account's metadata, plus the key names it may not use.
 *
 * `reserved_claim_names` is the API telling the console what it would refuse, so
 * the editor can grey those out rather than let an operator find the rule by
 * being rejected. It is both halves of the rule: the seven registered JWT claim
 * names, and the API's own `role` (`usermeta.ReservedKeys`).
 *
 * The values are `unknown` on purpose. Metadata is arbitrary JSON that feeds JWT
 * claims, so the console renders it as JSON rather than pretending to know its
 * shape.
 */
const userMetadataSchema = z.object({
  user_id: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()),
  reserved_claim_names: z.array(z.string()),
});

export type UserMetadata = z.infer<typeof userMetadataSchema>;

/** One account's metadata. Admin token required, and Postgres-only. */
export async function fetchUserMetadata(options: {
  token: string;
  userId: string;
}): Promise<UserMetadata> {
  const path = userMetadataPath(options.userId);
  const data = await apiRequest<unknown>({ method: "GET", path, token: options.token });

  const parsed = userMetadataSchema.safeParse(data);
  if (!parsed.success) throw malformed("the account's metadata", path);
  return parsed.data;
}

/** Set one custom claim value on an account. */
export async function setUserMetadata(options: {
  token: string;
  userId: string;
  key: string;
  value: unknown;
}): Promise<UserMetadata> {
  const path = `${userMetadataPath(options.userId)}/${encodeURIComponent(options.key)}`;
  const data = await apiRequest<unknown>({
    method: "PUT",
    path,
    token: options.token,
    body: { value: options.value },
  });
  const parsed = userMetadataSchema.safeParse(data);
  if (!parsed.success) throw malformed("the account's updated metadata", path);
  return parsed.data;
}

/** Remove one custom claim value from an account. */
export async function deleteUserMetadata(options: {
  token: string;
  userId: string;
  key: string;
}): Promise<UserMetadata> {
  const path = `${userMetadataPath(options.userId)}/${encodeURIComponent(options.key)}`;
  const data = await apiRequest<unknown>({ method: "DELETE", path, token: options.token });
  const parsed = userMetadataSchema.safeParse(data);
  if (!parsed.success) throw malformed("the account's updated metadata", path);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// GET /v1/admin/oauth/providers and POST /v1/admin/oauth/{provider}/test
// ---------------------------------------------------------------------------

export const OAUTH_PROVIDERS_PATH = "/v1/admin/oauth/providers";

/**
 * One row of the configured-provider list. Configuration only: `configured`
 * says whether this deployment holds credentials, and nothing here says
 * whether the provider is reachable today, because answering that costs a
 probe and this list deliberately makes none. The reachability answer is
 * the test endpoint's, on demand.
 */
const oauthProviderSummarySchema = z.object({
  provider: z.string().min(1),
  configured: z.boolean(),
});

const oauthProviderListSchema = z.object({
  providers: z.array(oauthProviderSummarySchema),
});

export type OAuthProviderSummary = z.infer<typeof oauthProviderSummarySchema>;

/** Which providers this deployment can speak to, without probing. Admin token required. */
export async function fetchOAuthProviders(options: {
  token: string;
}): Promise<OAuthProviderSummary[]> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: OAUTH_PROVIDERS_PATH,
    token: options.token,
  });

  const parsed = oauthProviderListSchema.safeParse(data);
  if (!parsed.success) throw malformed("the provider list", OAUTH_PROVIDERS_PATH);
  return parsed.data.providers;
}

/**
 * The answer the API already publishes for a probe: the same shape
 * `/v1/admin/oauth/health` reports per provider, so the list's "Test" button
 * and the health report cannot word a verdict two ways. `status` is one of
 * ok, degraded, unreachable, not_configured; the last cannot arrive here,
 * because a provider without credentials is a 404 before anything is probed.
 */
const oauthProviderHealthSchema = z.object({
  provider: z.string().min(1),
  configured: z.boolean(),
  status: z.string().min(1),
  http_status: z.number().int().optional(),
  latency_ms: z.number().int().optional(),
  error: z.string().optional(),
});

export type OAuthProviderHealth = z.infer<typeof oauthProviderHealthSchema>;

/**
 * Tests one provider's authorize endpoint. Admin token required.
 *
 * The name is checked against the provider-name grammar before it is sent,
 * the same rule the OAuth unlink path uses: the value comes from the
 * console's own list, but it arrives at this function through a route
 * segment the browser chose, so the check is made where the URL is built
 * rather than trusted from the caller.
 */
export async function testOAuthProvider(options: {
  token: string;
  provider: string;
}): Promise<OAuthProviderHealth> {
  if (!/^[a-z0-9-]{1,32}$/.test(options.provider)) {
    throw new CrydenError("malformed", "that is not a provider name the console can send");
  }
  const path = `/v1/admin/oauth/${options.provider}/test`;
  const data = await apiRequest<unknown>({ method: "POST", path, token: options.token });

  const parsed = oauthProviderHealthSchema.safeParse(data);
  if (!parsed.success) throw malformed("the provider's reachability", path);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// GET /v1/admin/security/hash-migration
// ---------------------------------------------------------------------------

/**
 * The configured hasher, read from the API's configuration rather than from
 * stored hashes: the engine exposes no bulk way to inspect the algorithm behind
 * an existing hash. The Argon2id parameters are absent for bcrypt, which is why
 * they are optional here.
 */
const hasherSchema = z.object({
  algorithm: z.string().min(1),
  memory_kib: z.number().int().optional(),
  iterations: z.number().int().optional(),
  parallelism: z.number().int().optional(),
});

/**
 * `upgraded_events` counts events, not accounts: an account whose hash is
 * rewritten twice contributes two. The field names say so and the console must
 * not turn them into a percentage of users.
 */
const hashMigrationSchema = z.object({
  hasher: hasherSchema,
  total_users: z.number().int(),
  upgraded_events: z.number().int(),
  estimated_remaining: z.number().int(),
  window_days: z.number().int(),
  upgraded_events_in_window: z.number().int(),
});

export type HashMigration = z.infer<typeof hashMigrationSchema>;

/** How far a password-hash upgrade has got. Admin token required. */
export async function fetchHashMigration(options: {
  token: string;
  windowDays?: number;
}): Promise<HashMigration> {
  const params = new URLSearchParams();
  if (options.windowDays !== undefined) params.set("window_days", String(options.windowDays));

  const query = params.size === 0 ? "" : `?${params.toString()}`;
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `${HASH_MIGRATION_PATH}${query}`,
    token: options.token,
  });

  const parsed = hashMigrationSchema.safeParse(data);
  if (!parsed.success) throw malformed("the password hash report", HASH_MIGRATION_PATH);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// GET /v1/admin/security/mfa-adoption
// ---------------------------------------------------------------------------

/**
 * One factor's enrolment and removal history, in events.
 *
 * Every field counts events and none counts accounts, which is the difference
 * this console must not paper over: an operator who enables TOTP, loses their
 * phone and disables it contributes one enrolment and one removal while being
 * enrolled zero times over. See `mfaFactorDTO` in the API.
 */
const mfaFactorSchema = z.object({
  factor: z.string().min(1),
  enrolled_events: z.number().int(),
  removed_events: z.number().int(),
  enrolled_events_in_window: z.number().int(),
  removed_events_in_window: z.number().int(),
});

const mfaAdoptionSchema = z.object({
  total_users: z.number().int(),
  window_days: z.number().int(),
  factors: z.array(mfaFactorSchema),
});

export type MfaAdoption = z.infer<typeof mfaAdoptionSchema>;
export type MfaFactor = z.infer<typeof mfaFactorSchema>;

/** Second-factor enrolment and removal, as events. Admin token required. */
export async function fetchMfaAdoption(options: {
  token: string;
  windowDays?: number;
}): Promise<MfaAdoption> {
  const params = new URLSearchParams();
  if (options.windowDays !== undefined) params.set("window_days", String(options.windowDays));

  const query = params.size === 0 ? "" : `?${params.toString()}`;
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `${MFA_ADOPTION_PATH}${query}`,
    token: options.token,
  });

  const parsed = mfaAdoptionSchema.safeParse(data);
  if (!parsed.success) throw malformed("the second-factor report", MFA_ADOPTION_PATH);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// GET /v1/admin/digest/history
// ---------------------------------------------------------------------------

/**
 * One stored digest. `text` is the report the engine rendered when the run
 * happened, returned verbatim: nothing re-renders it, so a digest cannot change
 * between the schedule writing it and an operator reading it.
 */
const digestRunSchema = z.object({
  id: z.number().int(),
  window_start: z.string(),
  window_end: z.string(),
  generated_at: z.string(),
  text: z.string(),
});

const digestHistorySchema = z.object({
  runs: z.array(digestRunSchema),
  count: z.number().int(),
  limit: z.number().int(),
});

export type DigestRun = z.infer<typeof digestRunSchema>;
export type DigestHistory = z.infer<typeof digestHistorySchema>;

const digestReportSchema = z.object({
  since: z.string().datetime({ offset: true }),
  until: z.string().datetime({ offset: true }),
  window_days: z.number().int().min(1).max(365),
  text: z.string(),
});
export type DigestReport = z.infer<typeof digestReportSchema>;

/** Build a read-only report now; CSAG does not add this preview to scheduled history. */
export async function fetchDigestReport(options: {
  token: string;
  windowDays?: number;
}): Promise<DigestReport> {
  const params = new URLSearchParams();
  params.set("window_days", String(options.windowDays ?? 7));
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `${DIGEST_REPORT_PATH}?${params.toString()}`,
    token: options.token,
  });
  const parsed = digestReportSchema.safeParse(data);
  if (!parsed.success) throw malformed("the on-demand digest report", DIGEST_REPORT_PATH);
  return parsed.data;
}

/**
 * The digests the schedule has stored, newest first. Admin token required.
 *
 * A deployment whose API has no digest store answers 404 here: with no store
 * there is no history to read, and an empty list would be a lie about a
 * deployment that has never built a digest. That is why this function is allowed
 * to throw a 404 and why the caller treats it as a state rather than a fault.
 */
export async function fetchDigestHistory(options: {
  token: string;
  limit?: number;
}): Promise<DigestHistory> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? DASHBOARD_DIGEST_LIMIT));

  const data = await apiRequest<unknown>({
    method: "GET",
    path: `${DIGEST_HISTORY_PATH}?${params.toString()}`,
    token: options.token,
  });

  const parsed = digestHistorySchema.safeParse(data);
  if (!parsed.success) throw malformed("the digest history", DIGEST_HISTORY_PATH);
  return parsed.data;
}

const digestScheduleSchema = z.object({
  enabled: z.boolean(),
  day_of_week: z.enum([
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).max(64),
  recipients: z.array(z.string().email()).max(20),
  delivery_enabled: z.boolean(),
  delivery_available: z.boolean(),
  interval_hours: z.number().int().min(1).max(8760).optional(),
});

const digestScheduleInputSchema = digestScheduleSchema.omit({ delivery_available: true });
export type DigestSchedule = z.infer<typeof digestScheduleSchema>;
export type DigestScheduleInput = z.infer<typeof digestScheduleInputSchema>;

export async function fetchDigestSchedule(options: { token: string }): Promise<DigestSchedule> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: DIGEST_SETTINGS_PATH,
    token: options.token,
  });
  const parsed = digestScheduleSchema.safeParse(data);
  if (!parsed.success) throw malformed("the digest schedule", DIGEST_SETTINGS_PATH);
  return parsed.data;
}

export async function saveDigestSchedule(options: {
  token: string;
  settings: DigestScheduleInput;
}): Promise<DigestSchedule> {
  const input = digestScheduleInputSchema.safeParse(options.settings);
  if (!input.success) throw malformed("the digest schedule input", DIGEST_SETTINGS_PATH);
  const data = await apiRequest<unknown>({
    method: "PUT",
    path: DIGEST_SETTINGS_PATH,
    token: options.token,
    body: input.data,
  });
  const parsed = digestScheduleSchema.safeParse(data);
  if (!parsed.success) throw malformed("the saved digest schedule", DIGEST_SETTINGS_PATH);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// GET /v1/admin/email/stats and /v1/admin/settings/email-templates
// ---------------------------------------------------------------------------

/** Counts recorded email-related events; these are requests, not deliveries. */
const emailStatsSchema = z.object({
  window_days: z.number().int(),
  magic_links_requested: z.number().int(),
  magic_links_requested_in_window: z.number().int(),
  email_changes_requested: z.number().int(),
  email_changes_requested_in_window: z.number().int(),
  email_changes_confirmed: z.number().int(),
  email_changes_confirmed_in_window: z.number().int(),
});

export type EmailStats = z.infer<typeof emailStatsSchema>;

/** Read email activity recorded by the API's audit events. */
export async function fetchEmailStats(options: { token: string }): Promise<EmailStats> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: EMAIL_STATS_PATH,
    token: options.token,
  });
  const parsed = emailStatsSchema.safeParse(data);
  if (!parsed.success) throw malformed("email activity", EMAIL_STATS_PATH);
  return parsed.data;
}

const emailTemplateKindSchema = z.object({
  kind: z.enum(["verification", "magic_link"]),
  filename: z.string().min(1),
  configured: z.boolean(),
  sample: z.string().optional(),
  sample_error: z.string().optional(),
});

const emailTemplatesSchema = z.object({
  configured: z.boolean(),
  email_template_dir: z.string().optional(),
  kinds: z.array(emailTemplateKindSchema),
});

export type EmailTemplateKind = z.infer<typeof emailTemplateKindSchema>;
export type EmailTemplates = z.infer<typeof emailTemplatesSchema>;

/** Read template status and server-rendered plain-text samples. */
export async function fetchEmailTemplates(options: { token: string }): Promise<EmailTemplates> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: EMAIL_TEMPLATES_PATH,
    token: options.token,
  });
  const parsed = emailTemplatesSchema.safeParse(data);
  if (!parsed.success) throw malformed("email templates", EMAIL_TEMPLATES_PATH);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// GET and PUT /v1/admin/settings/password-policy
// ---------------------------------------------------------------------------

const passwordPolicySchema = z.object({
  min_length: z.number().int().min(8).max(72),
  max_length: z.number().int().min(8).max(72),
  require_uppercase: z.boolean(),
  require_lowercase: z.boolean(),
  require_digit: z.boolean(),
  require_symbol: z.boolean(),
});

export type PasswordPolicy = z.infer<typeof passwordPolicySchema>;

/** Read the active policy enforced by CSAG for password writes. */
export async function fetchPasswordPolicy(options: { token: string }): Promise<PasswordPolicy> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: PASSWORD_POLICY_PATH,
    token: options.token,
  });
  const parsed = passwordPolicySchema.safeParse(data);
  if (!parsed.success || parsed.data.max_length < parsed.data.min_length) {
    throw malformed("the active password policy", PASSWORD_POLICY_PATH);
  }
  return parsed.data;
}

/** Replace the active policy. CSAG validates the limits and audits the change. */
export async function updatePasswordPolicy(options: {
  token: string;
  policy: PasswordPolicy;
}): Promise<PasswordPolicy> {
  const data = await apiRequest<unknown>({
    method: "PUT",
    path: PASSWORD_POLICY_PATH,
    token: options.token,
    body: options.policy,
  });
  const parsed = passwordPolicySchema.safeParse(data);
  if (!parsed.success || parsed.data.max_length < parsed.data.min_length) {
    throw malformed("the saved password policy", PASSWORD_POLICY_PATH);
  }
  return parsed.data;
}

const adminSessionSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  email: z.string().email(),
  ip: z.string(),
  user_agent: z.string(),
  device: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
});

const adminSessionsSchema = z.object({
  sessions: z.array(adminSessionSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export type AdminSession = z.infer<typeof adminSessionSchema>;
export type AdminSessions = z.infer<typeof adminSessionsSchema>;

/** Read a page of active sessions across all accounts. */
export async function fetchAdminSessions(options: {
  token: string;
  limit?: number;
  offset?: number;
}): Promise<AdminSessions> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 25),
    offset: String(options.offset ?? 0),
  });
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `${ADMIN_SESSIONS_PATH}?${params}`,
    token: options.token,
  });
  const parsed = adminSessionsSchema.safeParse(data);
  if (!parsed.success) throw malformed("active sessions", ADMIN_SESSIONS_PATH);
  return parsed.data;
}

const adminOperatorSchema = z.object({
  user_id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["owner", "admin", "viewer"]),
  created_at: z.string().datetime({ offset: true }),
});

const adminOperatorsSchema = z.object({
  operators: z.array(adminOperatorSchema),
  total: z.number().int().nonnegative(),
});

export type AdminOperator = z.infer<typeof adminOperatorSchema>;
export type AdminOperators = z.infer<typeof adminOperatorsSchema>;

/** Read the API's current operator roster. The API remains the role authority. */
export async function fetchAdminOperators(options: { token: string }): Promise<AdminOperators> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: ADMIN_OPERATORS_PATH,
    token: options.token,
  });
  const parsed = adminOperatorsSchema.safeParse(data);
  if (!parsed.success) throw malformed("operator roster", ADMIN_OPERATORS_PATH);
  return parsed.data;
}

export type OperatorStepUpPurpose =
  | "operator_role_change"
  | "operator_remove"
  | "operator_session_revoke"
  | "operator_passkey_remove"
  | "secret_reveal"
  | "secret_mutation";
const operatorStepUpOfferSchema = z.object({
  public_key: z.object({
    publicKey: z
      .object({
        challenge: z.string().min(1),
        rpId: z.string().min(1),
        allowCredentials: z.array(z.unknown()).optional(),
        userVerification: z.enum(["required", "preferred", "discouraged"]).optional(),
      })
      .passthrough(),
  }),
  ceremony_token: z.string().min(32),
});

export async function beginOperatorStepUp(options: {
  token: string;
  purpose: OperatorStepUpPurpose;
}) {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `${ADMIN_OPERATORS_PATH}/step-up/begin`,
    token: options.token,
    body: { purpose: options.purpose },
  });
  const parsed = operatorStepUpOfferSchema.safeParse(data);
  if (!parsed.success)
    throw malformed("operator step-up options", `${ADMIN_OPERATORS_PATH}/step-up/begin`);
  return { ...parsed.data, public_key: parsed.data.public_key.publicKey };
}

export async function finishOperatorStepUp(options: {
  token: string;
  purpose: OperatorStepUpPurpose;
  ceremonyToken: string;
  credential: unknown;
}): Promise<string> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `${ADMIN_OPERATORS_PATH}/step-up/finish`,
    token: options.token,
    body: {
      purpose: options.purpose,
      ceremony_token: options.ceremonyToken,
      credential: options.credential,
    },
  });
  const parsed = z.object({ grant: z.string().min(32) }).safeParse(data);
  if (!parsed.success)
    throw malformed("operator step-up grant", `${ADMIN_OPERATORS_PATH}/step-up/finish`);
  return parsed.data.grant;
}

export async function consumeOperatorStepUp(options: {
  token: string;
  grant: string;
  purpose: "secret_reveal" | "secret_mutation";
}): Promise<void> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `${ADMIN_OPERATORS_PATH}/step-up/consume`,
    token: options.token,
    headers: { "X-CSAG-Operator-Grant": options.grant },
    body: { purpose: options.purpose },
  });
  if (!z.object({ consumed: z.literal(true) }).safeParse(data).success)
    throw malformed("consumed operator step-up grant", `${ADMIN_OPERATORS_PATH}/step-up/consume`);
}

export async function changeOperatorRole(options: {
  token: string;
  grant: string;
  userID: string;
  role: AdminOperator["role"];
}): Promise<void> {
  await apiRequest<unknown>({
    method: "PUT",
    path: `${ADMIN_OPERATORS_PATH}/${encodeURIComponent(options.userID)}`,
    token: options.token,
    headers: { "X-CSAG-Operator-Grant": options.grant },
    body: { role: options.role },
  });
}

export async function removeOperator(options: {
  token: string;
  grant: string;
  userID: string;
}): Promise<void> {
  await apiRequest<unknown>({
    method: "DELETE",
    path: `${ADMIN_OPERATORS_PATH}/${encodeURIComponent(options.userID)}`,
    token: options.token,
    headers: { "X-CSAG-Operator-Grant": options.grant },
  });
}

const operatorSessionsSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.string().min(1),
      ip: z.string(),
      user_agent: z.string(),
      device: z.string(),
      created_at: z.string().datetime({ offset: true }),
    }),
  ),
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
  email: z.string().email(),
});
export type OperatorSessions = z.infer<typeof operatorSessionsSchema>;

export async function fetchOperatorSessions(options: {
  token: string;
  userID: string;
}): Promise<OperatorSessions> {
  const path = `${ADMIN_OPERATORS_PATH}/${encodeURIComponent(options.userID)}/sessions?limit=100&offset=0`;
  const parsed = operatorSessionsSchema.safeParse(
    await apiRequest<unknown>({ method: "GET", path, token: options.token }),
  );
  if (!parsed.success) throw malformed("operator sessions", path);
  return parsed.data;
}

const operatorPasskeysSchema = z.object({
  passkeys: z.array(
    z.object({
      credential_id: z.string().min(1),
      nickname: z.string(),
      created_at: z.string().datetime({ offset: true }),
      last_used_at: z.string().datetime({ offset: true }).optional(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export type OperatorPasskeys = z.infer<typeof operatorPasskeysSchema>;

export async function fetchOperatorPasskeys(options: {
  token: string;
  userID: string;
}): Promise<OperatorPasskeys> {
  const path = `${ADMIN_OPERATORS_PATH}/${encodeURIComponent(options.userID)}/passkeys`;
  const parsed = operatorPasskeysSchema.safeParse(
    await apiRequest<unknown>({ method: "GET", path, token: options.token }),
  );
  if (!parsed.success) throw malformed("operator passkeys", path);
  return parsed.data;
}

export async function revokeOperatorSession(options: {
  token: string;
  grant: string;
  userID: string;
  sessionID: string;
}): Promise<void> {
  await apiRequest<unknown>({
    method: "DELETE",
    path: `${ADMIN_OPERATORS_PATH}/${encodeURIComponent(options.userID)}/sessions/${encodeURIComponent(options.sessionID)}`,
    token: options.token,
    headers: { "X-CSAG-Operator-Grant": options.grant },
  });
}

export async function revokeOperatorSessions(options: {
  token: string;
  grant: string;
  userID: string;
}): Promise<number> {
  const data = await apiRequest<unknown>({
    method: "DELETE",
    path: `${ADMIN_OPERATORS_PATH}/${encodeURIComponent(options.userID)}/sessions`,
    token: options.token,
    headers: { "X-CSAG-Operator-Grant": options.grant },
  });
  const parsed = z.object({ revoked: z.number().int().nonnegative() }).safeParse(data);
  if (!parsed.success)
    throw malformed(
      "revoked operator sessions",
      `${ADMIN_OPERATORS_PATH}/${options.userID}/sessions`,
    );
  return parsed.data.revoked;
}

export async function removeOperatorPasskey(options: {
  token: string;
  grant: string;
  userID: string;
  credentialID: string;
}): Promise<void> {
  await apiRequest<unknown>({
    method: "DELETE",
    path: `${ADMIN_OPERATORS_PATH}/${encodeURIComponent(options.userID)}/passkeys/${encodeURIComponent(options.credentialID)}`,
    token: options.token,
    headers: { "X-CSAG-Operator-Grant": options.grant },
  });
}

/** Revoke one active session by its ID. */
export async function revokeAdminSession(options: {
  token: string;
  sessionID: string;
}): Promise<void> {
  await apiRequest<unknown>({
    method: "DELETE",
    path: `${ADMIN_SESSIONS_PATH}/${encodeURIComponent(options.sessionID)}`,
    token: options.token,
  });
}

/** Revoke every active session on the deployment. */
export async function revokeAllAdminSessions(options: { token: string }): Promise<number> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `${ADMIN_SESSIONS_PATH}/revoke-all`,
    token: options.token,
  });
  const parsed = z
    .object({ status: z.string(), revoked: z.number().int().nonnegative() })
    .safeParse(data);
  if (!parsed.success) throw malformed("revoked sessions", `${ADMIN_SESSIONS_PATH}/revoke-all`);
  return parsed.data.revoked;
}

const anomalyReviewSchema = z.object({
  status: z.enum(["unreviewed", "confirmed", "dismissed"]),
  note: z.string(),
  reviewer_id: z.string().optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});

const anomalySchema = z.object({
  id: z.string().min(1),
  type: z.enum(["anomaly_detected", "credential_stuffing_detected"]),
  user_id: z.string().optional(),
  ip: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  created_at: z.string().datetime({ offset: true }),
  review: anomalyReviewSchema,
});

const anomalyListSchema = z.object({
  anomalies: z.array(anomalySchema),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  status: z.string().optional(),
  has_more: z.boolean(),
});

export type Anomaly = z.infer<typeof anomalySchema>;
export type AnomalyList = z.infer<typeof anomalyListSchema>;
export type AnomalyStatus = "unreviewed" | "confirmed" | "dismissed";

/** Read a page from CSAG's persisted anomaly review queue. */
export async function fetchAnomalies(options: {
  token: string;
  limit?: number;
  offset?: number;
  status?: AnomalyStatus;
}): Promise<AnomalyList> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 25),
    offset: String(options.offset ?? 0),
  });
  if (options.status !== undefined) params.set("status", options.status);
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `${ADMIN_ANOMALIES_PATH}?${params}`,
    token: options.token,
  });
  const parsed = anomalyListSchema.safeParse(data);
  if (!parsed.success) throw malformed("the anomaly review queue", ADMIN_ANOMALIES_PATH);
  return parsed.data;
}

/** Save a human decision about one flagged event. This does not act on accounts. */
export async function reviewAnomaly(options: {
  token: string;
  eventID: string;
  status: AnomalyStatus;
  note: string;
}): Promise<Anomaly["review"]> {
  const data = await apiRequest<unknown>({
    method: "PUT",
    path: `${ADMIN_ANOMALIES_PATH}/${encodeURIComponent(options.eventID)}`,
    token: options.token,
    body: { status: options.status, note: options.note },
  });
  const parsed = anomalyReviewSchema.safeParse(data);
  if (!parsed.success) throw malformed("the anomaly review", ADMIN_ANOMALIES_PATH);
  return parsed.data;
}

const auditEventsSchema = z.object({
  events: z.array(auditEventSchema),
  limit: z.number().int().positive(),
  has_more: z.boolean(),
  next_cursor: z.string(),
});

export type AuditEvents = z.infer<typeof auditEventsSchema>;
export type AuditFilters = {
  eventType?: string;
  userID?: string;
  since?: string;
  until?: string;
};

/** Read a cursor page of audit events with the server's filters applied. */
export async function fetchAuditEvents(options: {
  token: string;
  filters?: AuditFilters;
  cursor?: string;
  limit?: number;
}): Promise<AuditEvents> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.filters?.eventType) params.set("event_type", options.filters.eventType);
  if (options.filters?.userID) params.set("user_id", options.filters.userID);
  if (options.filters?.since) params.set("since", options.filters.since);
  if (options.filters?.until) params.set("until", options.filters.until);
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `${ADMIN_AUDIT_PATH}?${params}`,
    token: options.token,
  });
  const parsed = auditEventsSchema.safeParse(data);
  if (!parsed.success) throw malformed("the audit log", ADMIN_AUDIT_PATH);
  return parsed.data;
}

const webhookStatusSchema = z.enum(["pending", "in_flight", "delivered", "failed"]);
const webhookDeliverySchema = z.object({
  id: z.number().int(),
  event_id: z.string(),
  event_type: z.string(),
  destination_id: z.string(),
  destination_name: z.string(),
  user_id: z.string().optional(),
  ip: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  status: webhookStatusSchema,
  attempts: z.number().int(),
  response_code: z.number().int().optional(),
  error: z.string().optional(),
  duration_ms: z.number().int(),
  created_at: z.string().datetime({ offset: true }),
  next_attempt_at: z.string().datetime({ offset: true }),
  delivered_at: z.string().datetime({ offset: true }).nullable().optional(),
});

const webhookDeliveriesSchema = z.object({
  deliveries: z.array(webhookDeliverySchema),
  count: z.number().int().nonnegative(),
  status: webhookStatusSchema.optional(),
  statuses: z.array(webhookStatusSchema),
});

export type WebhookStatus = z.infer<typeof webhookStatusSchema>;
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;
export type WebhookDeliveries = z.infer<typeof webhookDeliveriesSchema>;

const webhookEndpointSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  url: z.string(),
  secret_set: z.boolean(),
});
export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;

const webhookDestinationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string(),
  secret_set: z.boolean(),
});
export type WebhookDestination = z.infer<typeof webhookDestinationSchema>;
const webhookEndpointListSchema = z.object({ endpoints: z.array(webhookDestinationSchema) });
export type WebhookEndpointList = z.infer<typeof webhookEndpointListSchema>;

export async function fetchWebhookEndpoints(options: {
  token: string;
}): Promise<WebhookEndpointList> {
  const path = `${WEBHOOK_ENDPOINT_PATH}/endpoints`;
  const data = await apiRequest<unknown>({ method: "GET", path, token: options.token });
  const parsed = webhookEndpointListSchema.safeParse(data);
  if (!parsed.success) throw malformed("webhook destinations", path);
  return parsed.data;
}

export async function createWebhookEndpoint(options: {
  token: string;
  name: string;
  url: string;
  secret: string;
}): Promise<WebhookDestination> {
  return requestWebhookEndpoint({
    method: "POST",
    path: `${WEBHOOK_ENDPOINT_PATH}/endpoints`,
    token: options.token,
    body: { name: options.name, url: options.url, secret: options.secret },
  });
}

export async function updateWebhookEndpoint(options: {
  token: string;
  id: string;
  name: string;
  url: string;
  secret?: string;
}): Promise<WebhookDestination> {
  return requestWebhookEndpoint({
    method: "PUT",
    path: `${WEBHOOK_ENDPOINT_PATH}/endpoints/${encodeURIComponent(options.id)}`,
    token: options.token,
    body: { name: options.name, url: options.url, secret: options.secret },
  });
}

async function requestWebhookEndpoint(options: {
  method: "POST" | "PUT";
  path: string;
  token: string;
  body: Record<string, string | undefined>;
}): Promise<WebhookDestination> {
  const data = await apiRequest<unknown>({
    method: options.method,
    path: options.path,
    token: options.token,
    body: options.body,
  });
  const parsed = webhookDestinationSchema.safeParse(data);
  if (!parsed.success) throw malformed("webhook destination", options.path);
  return parsed.data;
}

export async function removeWebhookEndpoint(options: { token: string; id: string }): Promise<void> {
  const path = `${WEBHOOK_ENDPOINT_PATH}/endpoints/${encodeURIComponent(options.id)}`;
  await apiRequest<unknown>({ method: "DELETE", path, token: options.token });
}

export async function queueWebhookDestinationTest(options: {
  token: string;
  id: string;
}): Promise<{ queued: boolean; event_id: string; destination_id: string }> {
  const path = `${WEBHOOK_ENDPOINT_PATH}/endpoints/${encodeURIComponent(options.id)}/test`;
  const data = await apiRequest<unknown>({ method: "POST", path, token: options.token });
  const parsed = z
    .object({ queued: z.boolean(), event_id: z.string(), destination_id: z.string() })
    .safeParse(data);
  if (!parsed.success) throw malformed("webhook test delivery", path);
  return parsed.data;
}

export async function fetchWebhookEndpoint(options: { token: string }): Promise<WebhookEndpoint> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: WEBHOOK_ENDPOINT_PATH,
    token: options.token,
  });
  const parsed = webhookEndpointSchema.safeParse(data);
  if (!parsed.success) throw malformed("webhook endpoint settings", WEBHOOK_ENDPOINT_PATH);
  return parsed.data;
}

export async function saveWebhookEndpoint(options: {
  token: string;
  url: string;
  secret?: string;
}): Promise<WebhookEndpoint> {
  const data = await apiRequest<unknown>({
    method: "PUT",
    path: WEBHOOK_ENDPOINT_PATH,
    token: options.token,
    body: { url: options.url, secret: options.secret },
  });
  const parsed = webhookEndpointSchema.safeParse(data);
  if (!parsed.success) throw malformed("webhook endpoint settings", WEBHOOK_ENDPOINT_PATH);
  return parsed.data;
}

export async function clearWebhookEndpoint(options: { token: string }): Promise<WebhookEndpoint> {
  const data = await apiRequest<unknown>({
    method: "DELETE",
    path: WEBHOOK_ENDPOINT_PATH,
    token: options.token,
  });
  const parsed = webhookEndpointSchema.safeParse(data);
  if (!parsed.success) throw malformed("webhook endpoint settings", WEBHOOK_ENDPOINT_PATH);
  return parsed.data;
}

export async function queueWebhookTest(options: {
  token: string;
}): Promise<{ queued: boolean; event_id: string }> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `${WEBHOOK_ENDPOINT_PATH}/test`,
    token: options.token,
  });
  const parsed = z.object({ queued: z.boolean(), event_id: z.string() }).safeParse(data);
  if (!parsed.success) throw malformed("webhook test delivery", `${WEBHOOK_ENDPOINT_PATH}/test`);
  return parsed.data;
}

const jwtClaimMappingSchema = z.object({ claim: z.string(), source: z.string() });
const jwtClaimsSchema = z.object({
  mappings: z.array(jwtClaimMappingSchema),
  reserved_claim_names: z.array(z.string()),
});
export type JWTClaimMapping = z.infer<typeof jwtClaimMappingSchema>;
export type JWTClaimsConfig = z.infer<typeof jwtClaimsSchema>;

export async function fetchJWTClaims(options: { token: string }): Promise<JWTClaimsConfig> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: JWT_CLAIMS_PATH,
    token: options.token,
  });
  const parsed = jwtClaimsSchema.safeParse(data);
  if (!parsed.success) throw malformed("JWT claim mappings", JWT_CLAIMS_PATH);
  return parsed.data;
}

export async function saveJWTClaims(options: {
  token: string;
  mappings: JWTClaimMapping[];
}): Promise<JWTClaimsConfig> {
  const data = await apiRequest<unknown>({
    method: "PUT",
    path: JWT_CLAIMS_PATH,
    token: options.token,
    body: { mappings: options.mappings },
  });
  const parsed = jwtClaimsSchema.safeParse(data);
  if (!parsed.success) throw malformed("JWT claim mappings", JWT_CLAIMS_PATH);
  return parsed.data;
}

export async function previewJWTClaims(options: { token: string; userId: string }): Promise<{
  user_id: string;
  email: string;
  claims: Record<string, unknown>;
  signed: boolean;
}> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `${JWT_CLAIMS_PATH}/preview`,
    token: options.token,
    body: { user_id: options.userId },
  });
  const schema = z.object({
    user_id: z.string(),
    email: z.string(),
    claims: z.record(z.string(), z.unknown()),
    signed: z.boolean(),
  });
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw malformed("JWT claim preview", `${JWT_CLAIMS_PATH}/preview`);
  return parsed.data;
}

/** Read the API's webhook delivery log. */
export async function fetchWebhookDeliveries(options: {
  token: string;
  status?: WebhookStatus;
  destinationID?: string;
  limit?: number;
}): Promise<WebhookDeliveries> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
  if (options.status) params.set("status", options.status);
  if (options.destinationID) params.set("destination_id", options.destinationID);
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `${WEBHOOK_DELIVERIES_PATH}?${params}`,
    token: options.token,
  });
  const parsed = webhookDeliveriesSchema.safeParse(data);
  if (!parsed.success) throw malformed("webhook delivery log", WEBHOOK_DELIVERIES_PATH);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// GET /v1/admin/logging/recent
// ---------------------------------------------------------------------------

const shippedLogEventSchema = z.object({
  id: z.number().int(),
  level: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.string()).optional(),
  sink: z.string(),
  shipped_at: z.string().datetime({ offset: true }),
});

const shippedLogsSchema = z.object({
  events: z.array(shippedLogEventSchema),
  count: z.number().int().nonnegative(),
  level: z.string().optional(),
  levels: z.array(z.string()),
});

export type ShippedLogEvent = z.infer<typeof shippedLogEventSchema>;
export type ShippedLogs = z.infer<typeof shippedLogsSchema>;

const loggingSettingsSchema = z.object({
  enabled: z.boolean(),
  min_level: z.enum(["debug", "info", "warn", "error"]),
  redaction: z.enum(["mask", "hash"]),
  hash_key_set: z.boolean(),
});
export type LoggingSettings = z.infer<typeof loggingSettingsSchema>;

export async function fetchLoggingSettings(options: { token: string }): Promise<LoggingSettings> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: LOGGING_SETTINGS_PATH,
    token: options.token,
  });
  const parsed = loggingSettingsSchema.safeParse(data);
  if (!parsed.success) throw malformed("cloud logging settings", LOGGING_SETTINGS_PATH);
  return parsed.data;
}

export async function saveLoggingSettings(options: {
  token: string;
  enabled: boolean;
  minLevel: LoggingSettings["min_level"];
}): Promise<LoggingSettings> {
  const data = await apiRequest<unknown>({
    method: "PUT",
    path: LOGGING_SETTINGS_PATH,
    token: options.token,
    body: { enabled: options.enabled, min_level: options.minLevel },
  });
  const parsed = loggingSettingsSchema.safeParse(data);
  if (!parsed.success) throw malformed("cloud logging settings", LOGGING_SETTINGS_PATH);
  return parsed.data;
}

/** Read the API's redacted cloud-shipping log. */
export async function fetchShippedLogs(options: {
  token: string;
  level?: string;
  limit?: number;
}): Promise<ShippedLogs> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
  if (options.level) params.set("level", options.level);
  const data = await apiRequest<unknown>({
    method: "GET",
    path: `${SHIPPED_LOGS_PATH}?${params}`,
    token: options.token,
  });
  const parsed = shippedLogsSchema.safeParse(data);
  if (!parsed.success) throw malformed("shipped log events", SHIPPED_LOGS_PATH);
  return parsed.data;
}

const llmProviderSchema = z.object({
  kind: z.string(),
  model: z.string(),
  base_url: z.string().default(""),
  max_tokens: z.number().int(),
  temperature: z.number().default(0.2),
  rpm: z.number().int().default(60),
  api_key_set: z.boolean(),
  configured: z.boolean(),
});

export type LLMProvider = z.infer<typeof llmProviderSchema>;
export type LLMProviderInput = {
  kind: "anthropic" | "openai-compatible";
  model: string;
  api_key: string;
  base_url?: string;
  max_tokens: number;
  temperature: number;
  rpm: number;
};
export type LLMProviderTestInput = Omit<LLMProviderInput, "api_key"> & { api_key?: string };

/** Read the encrypted LLM setting in its redacted form. */
export async function fetchLLMProvider(options: { token: string }): Promise<LLMProvider> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: LLM_PROVIDER_PATH,
    token: options.token,
  });
  const parsed = llmProviderSchema.safeParse(data);
  if (!parsed.success) throw malformed("the LLM provider settings", LLM_PROVIDER_PATH);
  return parsed.data;
}

export async function saveLLMProvider(options: {
  token: string;
  input: LLMProviderInput;
}): Promise<LLMProvider> {
  const data = await apiRequest<unknown>({
    method: "PUT",
    path: LLM_PROVIDER_PATH,
    token: options.token,
    body: options.input,
  });
  const parsed = llmProviderSchema.safeParse(data);
  if (!parsed.success) throw malformed("the saved LLM provider settings", LLM_PROVIDER_PATH);
  return parsed.data;
}

export async function testLLMProvider(options: {
  token: string;
  input: LLMProviderTestInput;
}): Promise<{ status: string; kind: string; model: string }> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: `${LLM_PROVIDER_PATH}/test`,
    token: options.token,
    body: options.input,
    timeoutMs: 25_000,
  });
  const parsed = z
    .object({ status: z.string(), kind: z.string(), model: z.string() })
    .safeParse(data);
  if (!parsed.success) throw malformed("the LLM provider test result", `${LLM_PROVIDER_PATH}/test`);
  return parsed.data;
}

export async function fetchLLMModels(options: {
  token: string;
  api_key?: string;
  base_url: string;
}): Promise<string[]> {
  const path = `${LLM_PROVIDER_PATH}/models`;
  const data = await apiRequest<unknown>({
    method: "POST",
    path,
    token: options.token,
    body: { api_key: options.api_key, base_url: options.base_url },
    timeoutMs: 15_000,
  });
  const parsed = z.object({ models: z.array(z.string()) }).safeParse(data);
  if (!parsed.success) throw malformed("the LLM provider model list", path);
  return parsed.data.models;
}

const llmUsageSchema = z.object({
  scope: z.string(),
  providers: z.array(
    z.object({
      kind: z.string(),
      model: z.string(),
      requests: z.number(),
      succeeded: z.number(),
      failed: z.number(),
      rate_limited: z.number(),
      last_request_at: z.string().optional(),
      average_ms: z.number(),
    }),
  ),
});
export type LLMUsage = z.infer<typeof llmUsageSchema>;

export async function fetchLLMUsage(options: { token: string }): Promise<LLMUsage> {
  const path = `${LLM_PROVIDER_PATH}/usage`;
  const data = await apiRequest<unknown>({ method: "GET", path, token: options.token });
  const parsed = llmUsageSchema.safeParse(data);
  if (!parsed.success) throw malformed("LLM usage statistics", path);
  return parsed.data;
}

const databaseProviderSchema = z.object({
  label: z.string(),
  max_rows: z.number().int(),
  dsn_set: z.boolean(),
  host: z.string(),
  database: z.string(),
  configured: z.boolean(),
});

export type DatabaseProvider = z.infer<typeof databaseProviderSchema>;

export type DatabaseProviderInput = { label: string; dsn: string; max_rows: number };

/** Read database settings without receiving the DSN or its credentials. */
export async function fetchDatabaseProvider(options: { token: string }): Promise<DatabaseProvider> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: DATABASE_PROVIDER_PATH,
    token: options.token,
  });
  const parsed = databaseProviderSchema.safeParse(data);
  if (!parsed.success) throw malformed("the database provider settings", DATABASE_PROVIDER_PATH);
  return parsed.data;
}

/** Save a read-only connection; CSAG verifies the role by attempting a write before storing it. */
export async function saveDatabaseProvider(options: {
  token: string;
  input: DatabaseProviderInput;
}): Promise<DatabaseProvider> {
  const data = await apiRequest<unknown>({
    method: "PUT",
    path: DATABASE_PROVIDER_PATH,
    token: options.token,
    body: options.input,
    timeoutMs: 15_000,
  });
  const parsed = databaseProviderSchema.safeParse(data);
  if (!parsed.success)
    throw malformed("the saved database provider settings", DATABASE_PROVIDER_PATH);
  return parsed.data;
}

const supportDiagnosisSchema = z.object({
  email: z.string().email(),
  text: z.string(),
});

export type SupportDiagnosis = z.infer<typeof supportDiagnosisSchema>;

/** Read the API's account login diagnosis for an exact email address. */
export async function fetchSupportDiagnosis(options: {
  token: string;
  email: string;
}): Promise<SupportDiagnosis> {
  const params = new URLSearchParams({ email: options.email });
  const path = `${SUPPORT_DIAGNOSE_PATH}?${params}`;
  const data = await apiRequest<unknown>({ method: "GET", path, token: options.token });
  const parsed = supportDiagnosisSchema.safeParse(data);
  if (!parsed.success) throw malformed("the support diagnosis", SUPPORT_DIAGNOSE_PATH);
  return parsed.data;
}

const tuningSuggestionSchema = z.object({
  area: z.string(),
  finding: z.string(),
  suggestion: z.string(),
});

const configTuningSchema = z.object({
  since: z.string().datetime({ offset: true }),
  until: z.string().datetime({ offset: true }),
  window_days: z.number().int(),
  counts: z.record(z.string(), z.number().int()),
  suggestions: z.array(tuningSuggestionSchema),
});

export type TuningSuggestion = z.infer<typeof tuningSuggestionSchema>;
export type ConfigTuning = z.infer<typeof configTuningSchema>;

/** Read evidence-backed recommendations from the API. */
export async function fetchConfigTuning(options: {
  token: string;
  windowDays?: number;
}): Promise<ConfigTuning> {
  const params = new URLSearchParams({ window_days: String(options.windowDays ?? 30) });
  const path = `${CONFIG_TUNING_PATH}?${params}`;
  const data = await apiRequest<unknown>({ method: "GET", path, token: options.token });
  const parsed = configTuningSchema.safeParse(data);
  if (!parsed.success) throw malformed("the config tuning report", CONFIG_TUNING_PATH);
  return parsed.data;
}

const askAIWidgetSchema = z.object({
  enabled: z.boolean(),
  allowed_origins: z.array(z.string()),
  entities: z.array(z.string()),
  greeting: z.string(),
  placeholder: z.string(),
});

export type AskAIWidgetConfig = z.infer<typeof askAIWidgetSchema>;
export type AskAIWidgetInput = AskAIWidgetConfig;

/** Read the widget's non-secret configuration. */
export async function fetchAskAIWidget(options: { token: string }): Promise<AskAIWidgetConfig> {
  const data = await apiRequest<unknown>({
    method: "GET",
    path: ASK_AI_WIDGET_PATH,
    token: options.token,
  });
  const parsed = askAIWidgetSchema.safeParse(data);
  if (!parsed.success) throw malformed("the Ask-AI Widget settings", ASK_AI_WIDGET_PATH);
  return parsed.data;
}

/** Save widget configuration through CSAG's existing admin settings endpoint. */
export async function saveAskAIWidget(options: {
  token: string;
  input: AskAIWidgetInput;
}): Promise<AskAIWidgetConfig> {
  const data = await apiRequest<unknown>({
    method: "PUT",
    path: ASK_AI_WIDGET_PATH,
    token: options.token,
    body: options.input,
  });
  const parsed = askAIWidgetSchema.safeParse(data);
  if (!parsed.success) throw malformed("the saved Ask-AI Widget settings", ASK_AI_WIDGET_PATH);
  return parsed.data;
}

const askAIAnswerSchema = z.object({
  answer: z.string(),
  row_count: z.number().int().nonnegative(),
});

export type AskAIAnswer = z.infer<typeof askAIAnswerSchema>;

/** Ask the authenticated account about its own data. The API derives identity from the token. */
export async function askAI(options: { token: string; question: string }): Promise<AskAIAnswer> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path: ASK_AI_PATH,
    token: options.token,
    body: { question: options.question },
  });
  const parsed = askAIAnswerSchema.safeParse(data);
  if (!parsed.success) throw malformed("the Ask-AI response", ASK_AI_PATH);
  return parsed.data;
}

const adminAIQuerySchema = z.object({
  entity: z.enum(["users", "sessions", "audit_events"]),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  row_count: z.number().int(),
});
export type AdminAIQuery = z.infer<typeof adminAIQuerySchema>;

export async function queryAdminAI(options: {
  token: string;
  question: string;
}): Promise<AdminAIQuery> {
  return readAdminAIQuery(options, ADMIN_AI_QUERY_PATH);
}

const adminAIAnswerSchema = z.object({
  answer: z.string(),
  source_entity: z.enum(["shipped_logs", "anomalies", "users", "sessions", "audit_events"]),
  row_count: z.number().int().nonnegative(),
  since: z.enum(["1h", "24h", "7d", "30d"]).optional(),
});
export type AdminAIAnswer = z.infer<typeof adminAIAnswerSchema>;

async function readAdminAIAnswer(
  path: string,
  token: string,
  body: unknown,
): Promise<AdminAIAnswer> {
  const data = await apiRequest<unknown>({ method: "POST", path, token, body });
  const parsed = adminAIAnswerSchema.safeParse(data);
  if (!parsed.success) throw malformed("admin AI answer", path);
  return parsed.data;
}

export function summarizeAdminLogs(token: string): Promise<AdminAIAnswer> {
  return readAdminAIAnswer(ADMIN_AI_LOGS_PATH, token, {});
}

export function scanAdminAnomalies(token: string, since: "1h" | "24h" | "7d" | "30d") {
  return readAdminAIAnswer(ADMIN_AI_ANOMALIES_PATH, token, { since });
}

export async function queryAdminAudit(options: {
  token: string;
  question: string;
}): Promise<AdminAIQuery> {
  return readAdminAIQuery(options, ADMIN_AI_AUDIT_PATH);
}

export async function askAdminAI(options: {
  token: string;
  question: string;
}): Promise<AdminAIAnswer> {
  return readAdminAIAnswer(ADMIN_AI_ASK_PATH, options.token, { question: options.question });
}

async function readAdminAIQuery(
  options: { token: string; question: string },
  path: string,
): Promise<AdminAIQuery> {
  const data = await apiRequest<unknown>({
    method: "POST",
    path,
    token: options.token,
    body: { question: options.question },
  });
  const parsed = adminAIQuerySchema.safeParse(data);
  if (!parsed.success) throw malformed("admin AI query result", path);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// GET /v1/admin/stats, /doctor, and /migrations/status
// ---------------------------------------------------------------------------

const systemStatsSchema = z.object({
  users: z.number().int().nonnegative(),
  active_sessions: z.number().int().nonnegative(),
  operators: z.number().int().nonnegative(),
  active_api_keys: z.number().int().nonnegative(),
});
export type SystemStats = z.infer<typeof systemStatsSchema>;

const doctorSchema = z.object({
  status: z.enum(["healthy", "degraded"]),
  checked_at: z.string(),
  checks: z.array(
    z.object({
      name: z.enum(["database", "migrations"]),
      status: z.enum(["healthy", "attention", "failed", "unknown"]),
      detail: z.string(),
    }),
  ),
});
export type SystemDoctor = z.infer<typeof doctorSchema>;

const migrationsSchema = z.object({
  current: z.string().nullable(),
  applied: z.array(z.object({ name: z.string(), applied_at: z.string() })),
  pending: z.array(z.string()),
  unknown: z.array(z.string()),
});
export type SystemMigrations = z.infer<typeof migrationsSchema>;

async function readSystemAnswer<T>(path: string, schema: z.ZodType<T>, token: string): Promise<T> {
  const data = await apiRequest<unknown>({ method: "GET", path, token });
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw malformed("system status", path);
  return parsed.data;
}

export function fetchSystemStats(token: string): Promise<SystemStats> {
  return readSystemAnswer(SYSTEM_STATS_PATH, systemStatsSchema, token);
}

export function fetchSystemDoctor(token: string): Promise<SystemDoctor> {
  return readSystemAnswer(SYSTEM_DOCTOR_PATH, doctorSchema, token);
}

export function fetchSystemMigrations(token: string): Promise<SystemMigrations> {
  return readSystemAnswer(SYSTEM_MIGRATIONS_PATH, migrationsSchema, token);
}
