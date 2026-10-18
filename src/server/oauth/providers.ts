import "server-only";

import { OAUTH_PROVIDER_NOT_CONFIGURED, OAUTH_TEST_NOT_CONFIGURED_DETAIL } from "@/lib/oauth";

import {
  fetchOAuthProviders,
  testOAuthProvider,
  type OAuthProviderHealth,
  type OAuthProviderSummary,
} from "../cryden/admin";
import { CrydenError } from "../cryden/http";
import { sectionFailure, noStoreDetail, type Section } from "../cryden/section";

/**
 * The OAuth Providers screen's reads, in one place.
 *
 * The same shape `browse.ts` and `actions.ts` give the Users screen: the
 * console's route handlers compose here, so the browser never parses the
 * API's answer itself, and a field renamed on the API's side arrives as a
 * named section rather than as `undefined` on a row.
 */

export type OAuthProvidersPage = Section<OAuthProviderSummary[]>;

/** The configured-provider list, for an operator's token. */
export async function readOAuthProviders(options: { token: string }): Promise<OAuthProvidersPage> {
  try {
    return { state: "ok", data: await fetchOAuthProviders(options) };
  } catch (error) {
    return sectionFailure(error, "the provider list", noStoreDetail("the provider list"));
  }
}

export type OAuthProviderTestResult = Section<OAuthProviderHealth>;

/**
 * The refusal an unconfigured provider's test produces, worded as the
 * deployment's configuration rather than as a fault.
 *
 * The API answers 404 `oauth_provider_not_configured` before it probes, and
 * `sectionFailure` would leave that an `error`: it is not one of the codes it
 * maps, and rightly so, because for every other section a 404 of this shape
 * means a missing record. Here the missing thing is the deployment's own
 * credentials, which is a state an operator can fix, so it is intercepted the
 * way `missingOrAnswered` intercepts `not_found` for the Users screen.
 */
function notConfiguredOrFailed(error: unknown): Section<never> {
  if (error instanceof CrydenError && error.code === OAUTH_PROVIDER_NOT_CONFIGURED) {
    return { state: "empty", detail: OAUTH_TEST_NOT_CONFIGURED_DETAIL };
  }
  return sectionFailure(
    error,
    "the provider's reachability test",
    OAUTH_TEST_NOT_CONFIGURED_DETAIL,
  );
}

/**
 * Tests one provider's reachability, for an operator's token.
 *
 * An unconfigured name is deliberately not a fault: the API refuses it with
 * 404 `oauth_provider_not_configured` before probing, and
 * `notConfiguredOrFailed` words that as the deployment's configuration, which
 * is what the refusal means.
 */
export async function testProvider(options: {
  token: string;
  provider: string;
}): Promise<OAuthProviderTestResult> {
  try {
    return { state: "ok", data: await testOAuthProvider(options) };
  } catch (error) {
    return notConfiguredOrFailed(error);
  }
}
