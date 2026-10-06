/**
 * Copy the dashboard needs on both sides of the wire.
 *
 * The server composes section states and the browser renders them, so the
 * sentences live here rather than in either one: a failure worded in two places
 * is a failure worded two ways. Same reason `api-status.ts` exists for the
 * topbar tag. Formatting lives in `format.ts`, which the Users screen shares.
 */

/**
 * What the API answers every `/v1/admin/*` route with on a SQLite deployment,
 * without looking at the token. It is not an error and not an empty result: it
 * is the deployment saying that the console's tables are Postgres-only, which is
 * a fact about how it was configured rather than something that went wrong.
 */
export const SQLITE_ADMIN_DETAIL =
  "This deployment runs the API on SQLite, and every admin route is Postgres-only there. The console's screens need a deployment with DATABASE_URL set.";

/** Shown in place of the digest when the API reports no digest schedule. */
export const DIGEST_NOT_SCHEDULED_DETAIL =
  "No digest schedule is configured on this deployment, so none has ever been stored. Set DIGEST_INTERVAL_HOURS on the API to have one written regularly.";

/** Shown when a digest schedule exists but has not produced a run yet. */
export const DIGEST_NONE_STORED_DETAIL =
  "The digest schedule is configured but has not stored a run yet. The first one appears here once it has.";

/**
 * Shown when the API refuses an admin read with `not_operator`.
 *
 * This is the state a `viewer` console account lands in, and it is worth saying
 * plainly rather than as "forbidden": the account signed in perfectly well, and
 * the API is refusing the reports rather than the person. The API decides who is
 * an operator from the token's own `role` claim, so the fix is a grant on the
 * API's side and no amount of trying again here.
 */
export const NOT_OPERATOR_DETAIL =
  "The API does not recognise this account as a console operator, and every admin report is behind that. An operator grant on the API's side is what changes it.";
