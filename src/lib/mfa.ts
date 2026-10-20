/**
 * Copy the MFA & Passkeys screen needs on both sides of the wire.
 *
 * The server composes the section states and the browser renders them, so the
 * sentences live here rather than in either one: a failure worded in two places
 * is a failure worded two ways. Same reason `dashboard.ts` exists for the
 * dashboard and `oauth.ts` for the OAuth screen.
 */

/**
 * Why the tiles count events and never a share of users.
 *
 * The API's report counts enrolment and removal *events*, and its own comment
 * draws the line: an operator who enables TOTP, loses their phone and disables
 * it contributes one enrolment and one removal while being enrolled zero times
 * over. There is no numerator and denominator here that produce a share of
 * users, so no percentage is derived (BACKEND_GAPS 2.13). This sentence is what
 * the screen says instead of one, on both screens that read this report.
 */
export const MFA_ADOPTION_NOTE =
  "These count events, not accounts: an enrolment and its later removal are one of each, and an account that removed its factor is not enrolled. No share of users is derived from them.";

/**
 * Where force-disable lives, as the screen says it.
 *
 * The report has no per-account rows, so this screen cannot hang an action on
 * one. The action is real and lives where the accounts are listed, which is
 * what this sentence tells an operator who came here to find it.
 */
export const MFA_FORCE_DISABLE_NOTE =
  "Removing an account's second factor is done from its row on the Users screen: open the account and choose Remove MFA. There is no per-account factor list to act on here.";
