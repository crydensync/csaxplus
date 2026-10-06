/**
 * Copy the Users screen needs on both sides of the wire.
 *
 * The server composes section states and the browser renders them, so the
 * sentences live here rather than in either one, for the reason `dashboard.ts`
 * gives: a failure worded in two places is a failure worded two ways.
 */

/**
 * Shown when a read that named one account came back `not_found`.
 *
 * Distinct from a search that found nothing, which is a successful answer: this
 * one is a populated id that no longer resolves, so the drawer is describing a
 * record that was read and is not there rather than a query with no results.
 */
export const NO_SUCH_ACCOUNT_DETAIL =
  "The API has no account with that id. It may have been deleted since this list was read, or the link may be out of date.";

/**
 * Shown when a search matched no account.
 *
 * The API's email search is an exact, case-sensitive comparison against one
 * address, and nothing in the console can soften that: partial search would mean
 * the API querying the engine's own users table, which it deliberately does not
 * do (`api/httpapi/user_handlers.go`). A miss is therefore usually a spelling or
 * a capital letter rather than a missing account, which is what this says.
 */
export const EXACT_EMAIL_MISS_DETAIL =
  "The API matches the whole address, character for character, so this is a search for one exact account rather than a scan for anything similar. Check the spelling and the capitalisation, or clear the search to browse every account.";

/**
 * Shown beside the metadata panel, and the reason the editor is worth having.
 *
 * Stated because the consequence is not visible from the keys themselves: these
 * values are read when the API mints a token for this account, so editing one
 * changes what that account's tokens carry.
 */
export const METADATA_CLAIMS_DETAIL =
  "Metadata is stored by the API and feeds the claims on this account's tokens. Keys that would collide with a registered JWT claim are reserved, and the API refuses them.";

/** The API's two list modes, named as the API names them. */
export const MATCH_BROWSE = "browse";
export const MATCH_EXACT_EMAIL = "exact_email";

/**
 * What the API said it did with the query, in one sentence.
 *
 * Read from the answer rather than inferred from whether the operator typed
 * something: the API decides which mode answered, and a console that assumed
 * would be guessing at a rule it can simply be told. A mode this console does
 * not know is reported as itself, because an unknown mode means the answer on
 * screen may not mean what the screen thinks it means.
 */
export function describeMatch(match: string): string {
  if (match === MATCH_EXACT_EMAIL) return "The API matched one exact address.";
  if (match === MATCH_BROWSE) return "The API listed every account, newest first.";
  return `The API answered with a match mode this console does not know: ${match}.`;
}
