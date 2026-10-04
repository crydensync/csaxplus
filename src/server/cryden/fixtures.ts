import "server-only";

import { API_STATUS_DETAILS } from "@/lib/api-status";

import type { FixtureHealth } from "./health";

/**
 * The fixtures adapter: the one place in the console where sample data may live.
 *
 * It is selected by configuration alone (`CRYDEN_MODE=fixtures`) and never at
 * request time, never as a fallback for a call that failed, and never because a
 * screen found it convenient. A live call that fails stays failed; the screen
 * says so. That rule is the whole reason this module is separate from the live
 * adapter rather than a branch inside it.
 *
 * Its answers are typed as `FixtureHealth`, which cannot be `api-client`, so a
 * fixture can never claim a real connection even by mistake.
 *
 * Every screen's sample data belongs here as later tiers need it. There is none
 * yet: the only thing the console reads from the API so far is its health.
 */

/**
 * Shown wherever fixture data appears, so sample rows and a real outage are
 * never mistaken for each other.
 */
export const FIXTURES_NOTICE = API_STATUS_DETAILS.fixtures;

/** How the fixtures adapter answers a health check: it does not call anything. */
export function fixturesHealth(): FixtureHealth {
  return { state: "fixtures", detail: FIXTURES_NOTICE };
}
