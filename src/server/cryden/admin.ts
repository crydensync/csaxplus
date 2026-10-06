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
  ip: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  created_at: z.string(),
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

/**
 * The digests the schedule has stored, newest first. Admin token required.
 *
 * A deployment with no digest schedule answers 404 here, because the API's
 * digest store is only wired when `DIGEST_INTERVAL_HOURS` asked for one: with no
 * schedule there is no history to read, and an empty list would be a lie about a
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
