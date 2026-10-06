import "server-only";

import {
  DIGEST_NONE_STORED_DETAIL,
  DIGEST_NOT_SCHEDULED_DETAIL,
  NOT_OPERATOR_DETAIL,
  SQLITE_ADMIN_DETAIL,
} from "@/lib/dashboard";

import {
  DASHBOARD_DIGEST_LIMIT,
  DASHBOARD_USER_LIMIT,
  NOT_IMPLEMENTED_ON_SQLITE,
  fetchDigestHistory,
  fetchHashMigration,
  fetchMfaAdoption,
  fetchUsers,
  type AdminUser,
  type DigestRun,
  type HashMigration,
  type MfaAdoption,
} from "../cryden/admin";
import { CrydenError } from "../cryden/http";

/**
 * What the dashboard shows, gathered in one place so the page and its route
 * handler cannot disagree about it.
 *
 * Four reads of the API's admin surface, made together and reported one by one.
 * Not one combined success or failure, because the four fail independently and a
 * screen that went blank because the digest is unconfigured would be hiding
 * three reports that arrived fine. Each section carries its own state, so a card
 * can say what happened to it.
 *
 * Everything here is a GET on the API's read-only admin surface. Nothing in this
 * module writes, and nothing it calls can.
 */

/**
 * The dashboard's reporting window, passed explicitly rather than left to the
 * API's default. The API echoes the window it used, so the copy beside a count
 * is read from the answer rather than assumed.
 */
export const DASHBOARD_WINDOW_DAYS = 7;

/**
 * The API's code for "this feature has no backing store on this deployment"
 * (`api/httpapi/errors.go`, errAdminStoresUnavailable). For the digest history
 * it is how a deployment with no schedule answers, which is a state rather than
 * a fault.
 */
const NOT_CONFIGURED = "not_configured";

/**
 * The API's code for a valid token whose account holds no operator grant
 * (`api/httpapi/errors.go`, errNotOperator). Every other refusal and every
 * unknown account look identical to it on purpose, so the console reads it as
 * one state rather than trying to tell them apart.
 */
const NOT_OPERATOR = "not_operator";

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

export type AccountsSection = {
  /** Every account, from the API's own count rather than the page length. */
  total: number;
  /** The newest accounts, which is the order the API lists them in. */
  newest: AdminUser[];
};

export type DashboardOverview = {
  accounts: Section<AccountsSection>;
  factors: Section<MfaAdoption>;
  hashes: Section<HashMigration>;
  digest: Section<DigestRun>;
};

/**
 * The API's shapes, re-exported so a client component can name them without
 * reaching into this module's server-only neighbours. Type-only: nothing here
 * becomes a value in the browser's bundle.
 */
export type { AdminUser, DigestRun, HashMigration, MfaAdoption };

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
function failure(error: unknown, what: string, emptyDetail: string): Section<never> {
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
function noStoreDetail(what: string): string {
  return `This deployment has no store configured for ${what}, so there is nothing to report.`;
}

/**
 * Every section of the dashboard for one operator's token.
 *
 * The four reads run together: they are independent GETs against the same API,
 * so waiting for one before starting the next would make the screen slower for
 * no gain. Each is caught at its own boundary, which is what keeps one failure
 * from taking the other three with it.
 */
export async function dashboardOverview(token: string): Promise<DashboardOverview> {
  const [accounts, factors, hashes, digest] = await Promise.all([
    (async (): Promise<Section<AccountsSection>> => {
      try {
        const list = await fetchUsers({ token, limit: DASHBOARD_USER_LIMIT });
        return { state: "ok", data: { total: list.total, newest: list.users } };
      } catch (error) {
        return failure(error, "the account list", noStoreDetail("the account list"));
      }
    })(),

    (async (): Promise<Section<MfaAdoption>> => {
      try {
        return {
          state: "ok",
          data: await fetchMfaAdoption({ token, windowDays: DASHBOARD_WINDOW_DAYS }),
        };
      } catch (error) {
        return failure(error, "the second-factor report", noStoreDetail("second factors"));
      }
    })(),

    (async (): Promise<Section<HashMigration>> => {
      try {
        return {
          state: "ok",
          data: await fetchHashMigration({ token, windowDays: DASHBOARD_WINDOW_DAYS }),
        };
      } catch (error) {
        return failure(error, "the password hash report", noStoreDetail("password hashes"));
      }
    })(),

    (async (): Promise<Section<DigestRun>> => {
      try {
        const history = await fetchDigestHistory({ token, limit: DASHBOARD_DIGEST_LIMIT });
        const newest = history.runs[0];
        if (newest === undefined) return { state: "empty", detail: DIGEST_NONE_STORED_DETAIL };
        return { state: "ok", data: newest };
      } catch (error) {
        return failure(error, "the digest", DIGEST_NOT_SCHEDULED_DETAIL);
      }
    })(),
  ]);

  return { accounts, factors, hashes, digest };
}
