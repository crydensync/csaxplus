/**
 * Reading the console's own JSON answers.
 *
 * Every route under `/api` answers in the API's envelope, so the browser-side
 * code that talks to the console and the code that talks to the API read the
 * same shape. These two helpers are the console-side half of that: one for the
 * `data` of a success, one for the `error` of anything else.
 *
 * Nothing here throws. A console screen has to render the failure it got rather
 * than a stack trace, so every outcome is a value.
 */

/** A failure to show, already reduced to what the screen needs. */
export type ConsoleFailure = { message: string; code: string | null };

/**
 * The `data` of a console answer, or null when the answer is not one.
 *
 * Null rather than a thrown error because the caller has already decided the
 * response was ok, and a body that is not the envelope is then an answer this
 * console cannot read: the screen says so instead of rendering `undefined`.
 */
export function dataFrom<T>(payload: unknown): T | null {
  if (typeof payload !== "object" || payload === null) return null;
  if (!("data" in payload)) return null;
  return (payload as { data: T }).data;
}

/**
 * An answer's error, falling back to the status when it carries none.
 *
 * The status is the fallback rather than a generic sentence because it is the one
 * thing always present, and it is what an operator can match against a server
 * log when the console's own route failed before it could explain itself.
 */
export function failureFrom(payload: unknown, status: number): ConsoleFailure {
  const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  return {
    message:
      typeof error?.message === "string" && error.message !== ""
        ? error.message
        : `The console answered ${status}.`,
    code: typeof error?.code === "string" ? error.code : null,
  };
}
