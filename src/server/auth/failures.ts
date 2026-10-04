import "server-only";

import { CrydenError } from "../cryden/http";
import { ERROR_CODES, jsonError } from "./response";

/**
 * Turns anything a route handler caught into an answer for the browser.
 *
 * The API's own refusals are passed through with the API's code and wording:
 * they are written for the person reading them ("invalid email or password",
 * "this login attempt has expired"), the UI switches on the code, and
 * `mapError` on the API's side is a single site that never lets an internal
 * string out. What the console adds is the two cases the API cannot report
 * about itself, because in both of them it never answered.
 */
export function responseForFailure(error: unknown): Response {
  if (error instanceof CrydenError) {
    if (error.kind === "network" || error.kind === "timeout") {
      return jsonError(
        503,
        ERROR_CODES.apiUnreachable,
        "The console could not reach the CrydenSync API. Nothing was changed.",
      );
    }
    if (error.kind === "malformed") {
      return jsonError(
        502,
        ERROR_CODES.apiMalformed,
        "The CrydenSync API answered in a shape this console does not understand.",
      );
    }
    return jsonError(error.status ?? 502, error.code ?? ERROR_CODES.upstream, error.message);
  }

  // Anything else is a console bug. The operator is told nothing was changed,
  // which is true of every handler here: each one either completed or answered
  // before touching anything.
  return jsonError(
    500,
    ERROR_CODES.internal,
    "Something went wrong on the console. Nothing was changed.",
  );
}
