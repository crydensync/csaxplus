import "server-only";

import { DIGEST_NONE_STORED_DETAIL, DIGEST_NOT_SCHEDULED_DETAIL } from "@/lib/dashboard";

import {
  DASHBOARD_DIGEST_LIMIT,
  DASHBOARD_USER_LIMIT,
  fetchDigestHistory,
  fetchHashMigration,
  fetchMfaAdoption,
  fetchUsers,
  type AdminUser,
  type DigestRun,
  type HashMigration,
  type MfaAdoption,
} from "../cryden/admin";
import { noStoreDetail, sectionFailure, type Section } from "../cryden/section";

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
 * One section's outcome, and how a failed read becomes one.
 *
 * Both live in `cryden/section.ts` because the Users screen reads the same admin
 * surface and has to describe a refusal the same way. Re-exported here so a
 * client component can name the type without reaching past this module into a
 * server-only neighbour.
 */
export type { Section };

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
        return sectionFailure(error, "the account list", noStoreDetail("the account list"));
      }
    })(),

    (async (): Promise<Section<MfaAdoption>> => {
      try {
        return {
          state: "ok",
          data: await fetchMfaAdoption({ token, windowDays: DASHBOARD_WINDOW_DAYS }),
        };
      } catch (error) {
        return sectionFailure(error, "the second-factor report", noStoreDetail("second factors"));
      }
    })(),

    (async (): Promise<Section<HashMigration>> => {
      try {
        return {
          state: "ok",
          data: await fetchHashMigration({ token, windowDays: DASHBOARD_WINDOW_DAYS }),
        };
      } catch (error) {
        return sectionFailure(error, "the password hash report", noStoreDetail("password hashes"));
      }
    })(),

    (async (): Promise<Section<DigestRun>> => {
      try {
        const history = await fetchDigestHistory({ token, limit: DASHBOARD_DIGEST_LIMIT });
        const newest = history.runs[0];
        if (newest === undefined) return { state: "empty", detail: DIGEST_NONE_STORED_DETAIL };
        return { state: "ok", data: newest };
      } catch (error) {
        return sectionFailure(error, "the digest", DIGEST_NOT_SCHEDULED_DETAIL);
      }
    })(),
  ]);

  return { accounts, factors, hashes, digest };
}
