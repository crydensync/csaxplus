import "server-only";

import { z } from "zod";

import { API_STATUS_DETAILS } from "@/lib/api-status";

import { CrydenError, apiRequest, statusFromError } from "./http";

/**
 * What the console knows about the API's health, and how it found out.
 *
 * `GET /v1/health` is the API's only public status endpoint. It pings its own
 * database and answers either `{"data": {"status": "ok"}}` or a 503 with
 * `db_unreachable` (api/httpapi/health_handler.go). It reports nothing else: no
 * version, no database engine, no migration state. So the console can say
 * "connected" and cannot say "connected, production db", which is what the
 * prototype's tag claimed. Recorded in BACKEND_GAPS.md.
 *
 * This runs on every console screen, so it is given a shorter timeout than an
 * ordinary call: a topbar tag is worth three seconds, not ten.
 */

export const HEALTH_PATH = "/v1/health";

/** Shorter than `API_TIMEOUT_MS`: the tag is a status line, not a query. */
export const HEALTH_TIMEOUT_MS = 3_000;

/**
 * A state that came from asking the API.
 *
 * `api-client` is the only one that claims a healthy answer, and only a parsed
 * `{"status": "ok"}` produces it.
 */
export type LiveHealth =
  | { state: "api-client"; detail: string }
  | { state: "degraded"; detail: string; code: string | null }
  | { state: "offline"; detail: string; code: string | null };

/** A state that admits nothing was asked. Only the fixtures adapter produces one. */
export type FixtureHealth = { state: "fixtures"; detail: string };

export type ApiHealth = LiveHealth | FixtureHealth;

/**
 * The only shape the API's success answer has. Anything else is treated as an
 * unhealthy answer rather than read optimistically: the point of a health check
 * is to fail closed.
 */
const healthSchema = z.object({ status: z.literal("ok") });

/** The API is up and says its database is not. Its own code, named in the tag. */
const DB_UNREACHABLE = "db_unreachable";

function detailFor(state: "degraded" | "offline", code: string | null): string {
  if (state === "offline") return API_STATUS_DETAILS.offline;
  if (code === DB_UNREACHABLE) {
    return "The API is answering, but it reports that its own database is unreachable. Sign-in and every other call will fail until that is fixed.";
  }
  return API_STATUS_DETAILS.degraded;
}

/** Asks the API how it is. Never throws: an unreachable API is an answer. */
export async function fetchHealth(): Promise<LiveHealth> {
  try {
    const data = await apiRequest<unknown>({
      method: "GET",
      path: HEALTH_PATH,
      timeoutMs: HEALTH_TIMEOUT_MS,
    });

    if (!healthSchema.safeParse(data).success) {
      return {
        state: "degraded",
        detail:
          "The API answered, but not in the shape this console expects from a health check, so it cannot confirm the API is healthy.",
        code: "unexpected_health_answer",
      };
    }

    return { state: "api-client", detail: API_STATUS_DETAILS["api-client"] };
  } catch (error) {
    // `statusFromError` is the transport's own mapping, so the topbar and every
    // screen agree on what counts as offline rather than degraded.
    const state = statusFromError(error);
    const code = error instanceof CrydenError ? error.code : null;
    return { state, detail: detailFor(state, code), code };
  }
}
