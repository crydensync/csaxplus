import "server-only";

/**
 * The console's own JSON answers, in the same envelope the API uses, so the
 * browser-side code that talks to the console and the code that talks to the
 * API read the same shape.
 */

export function jsonOk<T>(data: T, init: ResponseInit = {}): Response {
  return Response.json({ data }, init);
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
  notFound: "not_found",
  upstream: "upstream_error",
  methodNotAllowed: "method_not_allowed",
} as const;
