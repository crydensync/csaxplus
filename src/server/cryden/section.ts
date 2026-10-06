import "server-only";

import { NOT_OPERATOR_DETAIL, SQLITE_ADMIN_DETAIL } from "@/lib/dashboard";

import { CrydenError } from "./http";

/**
 * One report's outcome, and the mapping from a failed API call to it.
 *
 * Extracted from the dashboard when the Users screen became the second thing to
 * read the API's admin surface. The mapping is the reason it is shared rather
 * than copied: which API code means "this deployment has no admin surface" and
 * which means "this account is not an operator" is a property of the API, and a
 * second copy of that rule is a second place for the console to get it wrong.
 * The two screens that read the admin surface render these states through the
 * same components, so the words match as well as the decisions.
 */

/**
 * The code the API answers every `/v1/admin/*` route with on a SQLite
 * deployment, without looking at the token
 * (`api/httpapi/middleware.go:145-151`). Named here because a screen has to tell
 * "this deployment cannot do admin" apart from "this call failed".
 */
export const NOT_IMPLEMENTED_ON_SQLITE = "not_implemented_on_sqlite";

/**
 * The API's code for "this feature has no backing store on this deployment"
 * (`api/httpapi/errors.go`, errAdminStoresUnavailable). For an optional store it
 * is how a deployment that never wired one answers, which is a state rather than
 * a fault.
 */
export const NOT_CONFIGURED = "not_configured";

/**
 * The API's code for a valid token whose account holds no operator grant
 * (`api/httpapi/errors.go`, errNotOperator). Every other refusal and every
 * unknown account look identical to it on purpose, so the console reads it as
 * one state rather than trying to tell them apart.
 */
export const NOT_OPERATOR = "not_operator";

/**
 * The API's code for a named record that is not there
 * (`api/httpapi/errors.go`, `store.ErrNotFound`). Kept apart from the 404
 * `not_configured` above even though both are 404s: "this deployment has no such
 * store" and "there is no row with that id" are different answers, and only the
 * code tells them apart.
 */
export const NOT_FOUND = "not_found";

/**
 * One section's outcome.
 *
 * `unavailable` and `forbidden` are separated from `error` because neither is a
 * fault: a SQLite deployment has no admin surface by design, and a refused
 * account was refused on purpose. `empty` is the same distinction one step down,
 * for a feature that answered correctly and has nothing to report.
 */
export type Section<T> =
  | { state: "ok"; data: T }
  | { state: "unavailable"; detail: string; code: string }
  | { state: "forbidden"; detail: string; code: string }
  | { state: "empty"; detail: string }
  | { state: "error"; detail: string; code: string | null };

/**
 * Turns a failed read into the section state that describes it.
 *
 * The order of the checks is the point. A deployment that cannot serve admin at
 * all is reported as that before anything about the call is considered, because
 * "this console cannot read this deployment" and "this call failed" send an
 * operator to two different places. A refused operator is checked next for the
 * same reason: the API refused the account, not the call.
 *
 * `emptyDetail` is what a `not_configured` answer means for this particular
 * section: the API uses that code for every feature whose store was never wired,
 * and only the caller knows which feature it just asked for.
 */
export function sectionFailure(error: unknown, what: string, emptyDetail: string): Section<never> {
  if (error instanceof CrydenError) {
    if (error.code === NOT_IMPLEMENTED_ON_SQLITE) {
      return { state: "unavailable", detail: SQLITE_ADMIN_DETAIL, code: error.code };
    }
    if (error.code === NOT_OPERATOR) {
      return { state: "forbidden", detail: NOT_OPERATOR_DETAIL, code: error.code };
    }
    if (error.code === NOT_CONFIGURED) {
      return { state: "empty", detail: emptyDetail };
    }
    return { state: "error", detail: error.message, code: error.code };
  }

  // Not a CrydenError: something threw that the transport does not map, which is
  // a console bug rather than an API failure. Reported as one rather than guessed
  // at.
  return {
    state: "error",
    detail: `The console could not read ${what}, and did not recognise the failure.`,
    code: null,
  };
}

/** What `not_configured` means for a report whose store was never wired. */
export function noStoreDetail(what: string): string {
  return `This deployment has no store configured for ${what}, so there is nothing to report.`;
}

/**
 * Whether the section is one an operator should read as a fault.
 *
 * `unavailable`, `forbidden` and `empty` were all answered correctly, so none of
 * them gets an alert or a retry. Shared because both screens announce the
 * difference the same way.
 */
export function isFault(section: Section<unknown>): boolean {
  return section.state === "error";
}
