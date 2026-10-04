import "server-only";

import { getConfig } from "../config";
import { fixturesHealth } from "./fixtures";
import { fetchHealth, type ApiHealth } from "./health";

/**
 * The typed client for the CrydenSync API.
 *
 * One interface, two adapters chosen by configuration. Screens ask for a client
 * and call it; they never branch on the mode themselves, because a screen that
 * branches is a screen that can forget to mention it is showing fixtures.
 *
 * This is deliberately thin. It holds what the console actually calls and grows
 * one method per endpoint as the tiers need it, rather than guessing at the
 * shapes of screens that do not exist yet. Whatever is added here is a call that
 * exists in the API's router, not a name invented to look complete.
 */

export type CrydenClient = {
  /** Which adapter this is, for the few places that have to say so out loud. */
  readonly mode: "live" | "fixtures";
  /** The API's health, or the fixture answer. Never throws. */
  health(): Promise<ApiHealth>;
};

const liveClient: CrydenClient = {
  mode: "live",
  health: fetchHealth,
};

const fixturesClient: CrydenClient = {
  mode: "fixtures",
  // Wrapped rather than passed directly so the fixtures adapter is only ever
  // reached through this client, and returns the same shape asynchronously.
  health: async () => fixturesHealth(),
};

/**
 * The client for the configured mode.
 *
 * Read per call rather than captured at module load, so a config change in a
 * test is seen rather than cached behind a stale singleton.
 */
export function crydenClient(): CrydenClient {
  return getConfig().api.mode === "fixtures" ? fixturesClient : liveClient;
}
