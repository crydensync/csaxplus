import "server-only";

import { fetchMfaAdoption, type MfaAdoption } from "../cryden/admin";
import { noStoreDetail, sectionFailure, type Section } from "../cryden/section";

/**
 * The MFA & Passkeys screen's read, in one place.
 *
 * The same shape `providers.ts` gives the OAuth screen: the console's route
 * handler composes here, so the browser never parses the API's answer itself,
 * and a field renamed on the API's side arrives as a named section rather than
 * as `undefined` on a card.
 *
 * Everything here is a GET on the API's read-only admin surface. Nothing in this
 * module writes, and nothing it calls can. The one write the step's brief names,
 * force-disable, lives on the Users screen where the account is: the API's
 * `POST /v1/admin/users/{id}/mfa/disable` is already wired there (step 1.2c),
 * behind its confirm modal and its admin gate, and there is no per-account
 * factor read to hang a per-row action on. See BACKEND_GAPS 5.2.
 */

export type MfaAdoptionPage = Section<MfaAdoption>;

/**
 * The second-factor report, for an operator's token.
 *
 * The window is the API's default rather than one this screen chose: the
 * dashboard passes an explicit window because its copy quotes it, and this
 * screen quotes the answer's own `window_days` instead, so the number and the
 * sentence cannot drift.
 */
export async function readMfaAdoption(options: { token: string }): Promise<MfaAdoptionPage> {
  try {
    return { state: "ok", data: await fetchMfaAdoption(options) };
  } catch (error) {
    return sectionFailure(error, "the second-factor report", noStoreDetail("second factors"));
  }
}
