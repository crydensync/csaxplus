import "server-only";

import {
  createUser,
  performUserAction,
  unlinkUserOAuth,
  type AdminActionResult,
  type UserAction,
} from "../cryden/admin";
import { sectionFailure, type Section } from "../cryden/section";

/**
 * What the Users screen writes, gathered in one place so its route handlers
 * cannot disagree about it.
 *
 * The write half of `browse.ts`, and a different shape from it: a read that
 * fails leaves the screen showing a section, but an action that fails must tell
 * the operator what happened *to the account*, in the drawer, without losing the
 * account that is already on screen. So the failures here use the same
 * `Section` vocabulary the reads do (one state per meaning, `forbidden` distinct
 * from `error`), and the success is the account the API answered with rather
 * than a bare 200.
 *
 * Every function here requires a token, like the rest of the admin surface. The
 * permission decisions are the API's: it checks the operator's role on each of
 * these paths and audits the action with the operator's id. The console refuses
 * a viewer before the call rather than after, and that is the whole of its own
 * opinion about who may act.
 */

/**
 * What an action answers, or the reason it did not.
 *
 * `Section`'s non-ok states cover everything an action can fail with: a SQLite
 * deployment (unavailable), a token the API does not treat as an operator's
 * (forbidden), and everything else an error. There is no `empty` of its own
 * because an action always has a target; a target that is gone arrives as the
 * API's `not_found` and stays an error with the API's own sentence.
 */
export type UserActionResult = Section<AdminActionResult>;

/**
 * One action, performed for an operator's token.
 *
 * `what` is the sentence fragment a failure names ("the suspension" and so on),
 * the same convention `sectionFailure`'s other callers keep. Each action gets
 * its own wording rather than one shared "the action", because four different
 * buttons can fail and four identical sentences would leave the operator
 * guessing which one did.
 */
const WHATS: Record<UserAction, string> = {
  unlock: "the unlock",
  suspend: "the suspension",
  unsuspend: "the unsuspension",
  "revoke-sessions": "the session revocation",
  "mfa-disable": "removing the second factor",
};

/** One action, performed for an operator's token. */
export async function actionUser(options: {
  token: string;
  userId: string;
  action: UserAction;
}): Promise<UserActionResult> {
  try {
    return { state: "ok", data: await performUserAction(options) };
  } catch (error) {
    return sectionFailure(error, `the ${WHATS[options.action]}`, "the account actions");
  }
}

/** Removes one OAuth provider's identity from an account. Admin token required. */
export async function unlinkOAuth(options: {
  token: string;
  userId: string;
  provider: string;
}): Promise<UserActionResult> {
  try {
    return { state: "ok", data: await unlinkUserOAuth(options) };
  } catch (error) {
    return sectionFailure(error, "the unlink", "the account's linked providers");
  }
}

/**
 * Registers a new account on the deployment.
 *
 * The answer is the account rather than an action result: there is no drawer to
 * re-render from it yet, and the screen's next list read is what shows it. The
 * password travels this function's argument only, and is never written down
 * (the transport's rule, stated in `http.ts`).
 */
export async function createUserAccount(options: {
  token: string;
  email: string;
  password: string;
}): Promise<UserActionResult> {
  try {
    const user = await createUser(options);
    return { state: "ok", data: { user } };
  } catch (error) {
    return sectionFailure(error, "the new account", "the account list");
  }
}
