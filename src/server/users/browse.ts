import "server-only";

import { NO_SUCH_ACCOUNT_DETAIL } from "@/lib/users";

import {
  fetchUserDetail,
  fetchUsers,
  fetchUserMetadata,
  type AdminUserDetail,
  type AdminUserList,
  type UserMetadata,
} from "../cryden/admin";
import { CrydenError } from "../cryden/http";
import { NOT_FOUND, noStoreDetail, sectionFailure, type Section } from "../cryden/section";

/**
 * What the Users screen reads, gathered in one place so its route handlers and
 * its components cannot disagree about it.
 *
 * Both reads are GETs on the API's read-only admin surface. Nothing in this
 * module writes, and nothing it calls can: the actions that do are a later step,
 * behind a step-up grant this module has no access to.
 */

/**
 * A page of accounts, or the reason there is not one.
 *
 * A search that matched nothing is `ok` with an empty list, not `empty`. The API
 * answered the question that was asked; `empty` is reserved for a feature that
 * has no backing store at all, which is a different thing to render.
 */
export type UserPage = Section<AdminUserList>;

/**
 * One account as the drawer shows it.
 *
 * Two sections rather than one because the two reads fail independently.
 * Metadata lives in the API's own table while the account and its activity come
 * from the engine's stores, so a deployment can answer one and not the other,
 * and a drawer that showed the account but not its metadata is more use than one
 * that showed neither.
 */
export type UserDetail = {
  detail: Section<AdminUserDetail>;
  metadata: Section<UserMetadata>;
};

/**
 * Turns a failure into a section, reading a missing record as an answer rather
 * than a fault.
 *
 * The distinction is the API's own, not this console's guess: a named record
 * that is not there arrives as the `not_found` code, while a feature whose store
 * was never wired arrives as `not_configured` and is left for `sectionFailure`
 * to describe. Both are 404s, so a caller checking only the status would confuse
 * "no such account" with "no such table".
 */
function missingOrAnswered(error: unknown, what: string, emptyDetail: string): Section<never> {
  if (error instanceof CrydenError && error.code === NOT_FOUND) {
    return { state: "empty", detail: NO_SUCH_ACCOUNT_DETAIL };
  }
  return sectionFailure(error, what, emptyDetail);
}

/**
 * One page of accounts for an operator's token.
 *
 * `limit`, `offset` and `query` are the caller's, checked at the route handler
 * before they get here: this function asks the API for what it was given rather
 * than re-validating it, so there is one place that decides what a page size may
 * be.
 */
export async function browseUsers(options: {
  token: string;
  limit?: number;
  offset?: number;
  query?: string;
}): Promise<UserPage> {
  try {
    return { state: "ok", data: await fetchUsers(options) };
  } catch (error) {
    return sectionFailure(error, "the account list", noStoreDetail("the account list"));
  }
}

/**
 * One account, and its metadata, for the drawer.
 *
 * The two reads run together because neither depends on the other: the metadata
 * endpoint answers with the whole key set on its own, so waiting for the account
 * before asking for it would only make the drawer slower. Each is caught at its
 * own boundary, so a metadata table that is not configured does not take the
 * account down with it.
 */
export async function readUser(options: { token: string; userId: string }): Promise<UserDetail> {
  const [detail, metadata] = await Promise.all([
    (async (): Promise<Section<AdminUserDetail>> => {
      try {
        return { state: "ok", data: await fetchUserDetail(options) };
      } catch (error) {
        return missingOrAnswered(error, "the account", noStoreDetail("the account"));
      }
    })(),

    (async (): Promise<Section<UserMetadata>> => {
      try {
        return { state: "ok", data: await fetchUserMetadata(options) };
      } catch (error) {
        return missingOrAnswered(error, "the account's metadata", noStoreDetail("metadata"));
      }
    })(),
  ]);

  return { detail, metadata };
}
