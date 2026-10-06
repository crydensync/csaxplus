/**
 * Copy and formatting the dashboard needs on both sides of the wire.
 *
 * The server composes section states and the browser renders them, so the
 * sentences live here rather than in either one: a failure worded in two places
 * is a failure worded two ways. Same reason `api-status.ts` exists for the
 * topbar tag.
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

/**
 * Formats an instant the API sent, in UTC, with the zone named.
 *
 * UTC rather than the reader's local time on purpose: these timestamps sit
 * beside API-supplied counts and are read next to logs and audit rows, all of
 * which are UTC. Naming the zone is what keeps that from being a guess, and
 * formatting on one clock is also what keeps the server's render and the
 * browser's identical.
 */
export function formatInstant(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "an unreadable time";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(at)} UTC`;
}

/** `7 days` / `1 day`, for a report whose window the API chose. */
export function describeWindow(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * A count with its thousands separated, on one locale so the same number is
 * written the same way wherever it is read.
 */
export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}
