/**
 * Copy the OAuth Providers screen needs on both sides of the wire.
 *
 * The server composes section states and the browser renders them, so the
 * sentences live here rather than in either one, for the reason
 * `dashboard.ts` gives: a failure worded in two places is a failure worded
 * two ways.
 */

/** The provider statuses the API reports, named as the API names them. */
export const OAUTH_STATUS_OK = "ok";
export const OAUTH_STATUS_DEGRADED = "degraded";
export const OAUTH_STATUS_UNREACHABLE = "unreachable";
export const OAUTH_STATUS_NOT_CONFIGURED = "not_configured";

/**
 * The API's refusal code for a provider this deployment holds no credentials
 * for (`api/httpapi/errors.go`, errOAuthProviderNotConfigured). A 404, but not
 * a `not_found`: the deployment was never configured to speak to this provider,
 * which is a state about the deployment rather than a missing record.
 */
export const OAUTH_PROVIDER_NOT_CONFIGURED = "oauth_provider_not_configured";

/**
 * What a probe's verdict means, in one sentence per state.
 *
 * The four states are the API's own vocabulary, and the sentences are the
 * screen's only opinion about them. A 4xx from an authorize endpoint counts
 * as reachable (it is what providers answer a bare GET with), which reads
 * wrong without that context, so the ok sentence says it: the provider is
 * up and serving, not that a login was attempted.
 */
export function describeOAuthStatus(status: string): string {
  switch (status) {
    case OAUTH_STATUS_OK:
      return "The authorize endpoint answered, which means it is up and serving. A bare GET is refused with a 4xx by every provider, so that is a pass rather than a fault.";
    case OAUTH_STATUS_DEGRADED:
      return "The endpoint answered 5xx: reachable, but saying it cannot serve anyone right now. Sign-in through this provider will fail until it recovers.";
    case OAUTH_STATUS_UNREACHABLE:
      return "No HTTP response at all: DNS, TLS, a connect failure or a timeout. Nothing about the configuration is implied; the provider or the network between them is not answering.";
    case OAUTH_STATUS_NOT_CONFIGURED:
      return "This deployment holds no credentials for this provider, so it cannot log anyone in and was not probed.";
    default:
      return `The API reported a status this console does not know: ${status}.`;
  }
}

/**
 * What an unconfigured provider's test refusal means, for the button that
 * triggered it. The API answers 404 `oauth_provider_not_configured` before
 * probing, so the sentence is about the deployment's configuration rather
 * than the provider's health.
 */
export const OAUTH_TEST_NOT_CONFIGURED_DETAIL =
  "This deployment has no credentials for that provider, so there was nothing to test. Configure its client ID and secret in the deployment's environment first.";

/** The caption under the list, saying what a test does and costs. */
export const OAUTH_TEST_COST_DETAIL =
  "Testing sends one request from this deployment to the provider's authorize endpoint, the same probe the health report runs. It carries no credentials and can neither start nor complete a sign-in.";
