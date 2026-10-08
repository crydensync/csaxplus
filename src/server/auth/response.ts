import "server-only";

/**
 * The console's own JSON answers, in the same envelope the API uses, so the
 * browser-side code that talks to the console and the code that talks to the
 * API read the same shape.
 */

export function jsonOk<T>(data: T, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  // Every answer here describes live state behind an authenticated cookie, so
  // none of it may sit in a cache, a proxy or a browser's back-forward store.
  headers.set("cache-control", "no-store");
  return Response.json({ data }, { ...init, headers });
}

export type ApiErrorShape = {
  error: { code: string; message: string };
};

export function jsonError(
  status: number,
  code: string,
  message: string,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  // An error answer is never worth caching, and a 401 in particular must not be.
  headers.set("cache-control", "no-store");
  return Response.json({ error: { code, message } } satisfies ApiErrorShape, {
    ...init,
    status,
    headers,
  });
}

/** Codes the console's own endpoints use. Kept stable: the UI switches on them. */
export const ERROR_CODES = {
  unauthenticated: "unauthenticated",
  csrf: "csrf_failed",
  forbidden: "forbidden",
  invalidRequest: "invalid_request",
  payloadTooLarge: "payload_too_large",
  notFound: "not_found",
  /** The request was well formed and the console still will not do it. */
  conflict: "conflict",
  /**
   * The operation needs a fresh step-up and there was no live grant for it. The
   * UI answers this by running the ceremony and trying again.
   */
  stepUpRequired: "step_up_required",
  /** A step-up ceremony did not check out. Running it again may work. */
  stepUpFailed: "step_up_failed",
  /** There is no passkey to step up with, so the ceremony cannot be run at all. */
  stepUpUnavailable: "step_up_unavailable",
  /** A paused sign-in whose pending cookie is gone or expired; start over. */
  loginExpired: "login_expired",
  /** The console could not reach the API at all: nothing was attempted. */
  apiUnreachable: "api_unreachable",
  /** The API answered, in a shape this console does not understand. */
  apiMalformed: "api_malformed",
  upstream: "upstream_error",
  internal: "internal_error",
  methodNotAllowed: "method_not_allowed",
} as const;
