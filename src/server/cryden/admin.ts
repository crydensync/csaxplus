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
 * How many accounts the dashboard's "newest" panel asks for. The same call
 * returns the total, so this is a display choice rather than a second request.
 */
export const DASHBOARD_USER_LIMIT = 5;

/** How many stored digests the dashboard looks back through. It shows the newest. */
export const DASHBOARD_DIGEST_LIMIT = 1;

/**
 * The code the API answers every `/v1/admin/*` route with on a SQLite
 * deployment, without looking at the token
 * (`api/httpapi/middleware.go:145-151`). Named here because a screen has to
 * tell "this deployment cannot do admin" apart from "this call failed".
 */
export const NOT_IMPLEMENTED_ON_SQLITE = "not_implemented_on_sqlite";

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

/** A page of accounts, newest first, plus the total. Admin token required. */
export async function fetchUsers(options: {
  token: string;
  limit?: number;
  offset?: number;
}): Promise<AdminUserList> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? DASHBOARD_USER_LIMIT));
  if (options.offset !== undefined) params.set("offset", String(options.offset));

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
