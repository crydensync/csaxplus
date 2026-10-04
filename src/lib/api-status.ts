/**
 * The four states of the console's connection to the CrydenSync API, and the
 * words for them.
 *
 * Kept out of the topbar component because two different sides need them: the
 * server decides which state is true (a real call, or the fixture adapter) and
 * the browser draws the tag. BUILD_NOTE 11.4 names the four values, so they are
 * the operator-facing labels too rather than a second vocabulary invented for
 * the screen.
 *
 * `api-client` is the only state that claims the API answered, and only a real
 * answer may produce it. `fixtures` is the only state that admits the data is
 * not real. Neither is ever inferred from a screen that has not asked.
 */

export type ApiStatus = "api-client" | "degraded" | "fixtures" | "offline";

/** Every state, in the order the console escalates through them. */
export const API_STATUSES = ["api-client", "degraded", "fixtures", "offline"] as const;

export const API_STATUS_LABELS: Record<ApiStatus, string> = {
  "api-client": "api-client",
  degraded: "degraded",
  fixtures: "fixtures",
  offline: "offline",
};

/** One sentence behind each tag, so the operator is never left decoding it. */
export const API_STATUS_DETAILS: Record<ApiStatus, string> = {
  "api-client": "The console reached the CrydenSync API and it reported itself healthy.",
  degraded:
    "The API answered, but not with a healthy status. Treat what this screen shows as possibly stale.",
  fixtures:
    "Serving labelled sample data. Nothing on this screen came from a real API, so no action taken here is real either.",
  offline: "The console could not reach the CrydenSync API. Nothing was attempted and nothing changed.",
};

export function apiStatusClass(status: ApiStatus): string {
  return STATUS_CLASS[status];
}

const STATUS_CLASS: Record<ApiStatus, string> = {
  "api-client": "env-tag",
  degraded: "env-tag degraded",
  fixtures: "env-tag fixtures",
  offline: "env-tag offline",
};
