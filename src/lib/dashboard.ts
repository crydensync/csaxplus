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

/** Stable API response code for the SQLite deployment state. */
export const NOT_IMPLEMENTED_ON_SQLITE = "not_implemented_on_sqlite";

/** Shown when the API says it cannot generate a current digest report. */
export const DIGEST_REPORT_UNAVAILABLE_DETAIL =
  "This API cannot generate a current security digest report on this deployment.";

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
