import "server-only";

import { ERROR_CODES, jsonError } from "../auth/response";
import { CeremonyError, type CeremonyFailure } from "./ceremonies";

/**
 * Turns a ceremony's refusal into something to say on screen.
 *
 * Every refusal is a 400 with wording written for the person reading it, and the
 * codes are kept to two so the UI has two things to do rather than seven. What
 * each failure has in common is that the step-up did not happen and nothing was
 * changed, so the honest next step is either "try again" or "register a passkey
 * first", and which one it is is the whole distinction between the two codes.
 *
 * An `unknown` that is not a `CeremonyError` is not handled here: it is a console
 * bug rather than a refusal, and `responseForFailure` is what answers it.
 */

/** The ceremony did not check out. Starting it again is worth trying. */
const RETRYABLE: ReadonlySet<CeremonyFailure> = new Set([
  "challenge",
  "challenge-kind",
  "verification",
  "credential-unknown",
  "credential-owner",
]);

/** Nothing to step up with, so no amount of retrying will help. */
const UNAVAILABLE: ReadonlySet<CeremonyFailure> = new Set(["no-passkey"]);

/** The refusal for a `CeremonyError`, or null if this is some other error. */
export function responseForCeremony(error: unknown): Response | null {
  if (!(error instanceof CeremonyError)) return null;

  if (UNAVAILABLE.has(error.failure)) {
    return jsonError(400, ERROR_CODES.stepUpUnavailable, error.message);
  }
  if (RETRYABLE.has(error.failure)) {
    // The library's own wording is never passed through: it names internal
    // checks, and what the operator needs to know is that it did not work.
    return jsonError(400, ERROR_CODES.stepUpFailed, error.message);
  }

  // A failure name added to `CeremonyFailure` without a home here still has to
  // answer something.
  return jsonError(400, ERROR_CODES.stepUpFailed, "That step-up did not work. Try again.");
}
