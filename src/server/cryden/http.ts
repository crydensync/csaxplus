import "server-only";

import { getConfig } from "../config";

/**
 * The transport under the CrydenSync API client: one place that knows the base
 * URL, the JSON envelope, the timeout and how a failure is shaped.
 *
 * The API answers `{"data": ...}` on success and
 * `{"error": {"code": "...", "message": "..."}}` on failure. Everything above
 * this module sees the unwrapped `data` or a `CrydenError`, so no caller has to
 * remember which shape it is looking at.
 *
 * Nothing here logs. A token, a password or a recovery code can all pass
 * through, and the console's rule is that none of them is ever written down.
 */

/** How long to wait for the API before giving up. */
export const API_TIMEOUT_MS = 10_000;

export type CrydenErrorKind =
  | "network" // never reached the API
  | "timeout" // reached it, or tried to, and gave up waiting
  | "http" // the API answered with an error envelope
  | "malformed"; // the API answered with something this client cannot read

export class CrydenError extends Error {
  readonly kind: CrydenErrorKind;
  readonly status: number | null;
  /** The API's own `error.code`, when it sent one. */
  readonly code: string | null;

  constructor(
    kind: CrydenErrorKind,
    message: string,
    options: { status?: number | null; code?: string | null; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "CrydenError";
    this.kind = kind;
    this.status = options.status ?? null;
    this.code = options.code ?? null;
  }

  /** A failure that is worth trying again, rather than a refusal. */
  get retryable(): boolean {
    if (this.kind === "network" || this.kind === "timeout") return true;
    return this.status !== null && this.status >= 500;
  }
}

export type ApiRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  /** Bearer token for the API. Never logged, never returned to a browser. */
  token?: string | undefined;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type Envelope = { data?: unknown; error?: { code?: unknown; message?: unknown } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Sends one request and returns the envelope's `data`.
 *
 * Throws `CrydenError` for every failure: a refused connection, a timeout, a
 * non-2xx answer, or a body that is not the envelope. Callers decide what to
 * show; they never have to inspect a status code to find out whether the call
 * worked.
 */
export async function apiRequest<T>(request: ApiRequest): Promise<T> {
  const { api } = getConfig();
  const url = new URL(request.path.replace(/^\//, ""), ensureTrailingSlash(api.url));

  const headers: Record<string, string> = { accept: "application/json" };
  if (request.body !== undefined) headers["content-type"] = "application/json";
  if (request.token !== undefined) headers.authorization = `Bearer ${request.token}`;

  const timeout = AbortSignal.timeout(request.timeoutMs ?? API_TIMEOUT_MS);
  const signal =
    request.signal === undefined ? timeout : AbortSignal.any([request.signal, timeout]);

  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method,
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal,
      // The API is a trusted internal service, and its answer is never cached:
      // every screen shows current state, behind an authenticated cookie.
      cache: "no-store",
    });
  } catch (error) {
    if (timeout.aborted) {
      throw new CrydenError("timeout", `the API did not answer within ${API_TIMEOUT_MS} ms`, {
        cause: error,
      });
    }
    throw new CrydenError("network", "the API could not be reached", { cause: error });
  }

  const text = await response.text();
  let envelope: Envelope | null = null;
  if (text !== "") {
    try {
      const parsed: unknown = JSON.parse(text);
      envelope = isRecord(parsed) ? parsed : null;
    } catch {
      envelope = null;
    }
  }

  if (!response.ok) {
    const errorBody = envelope?.error;
    const code = typeof errorBody?.code === "string" ? errorBody.code : null;
    const message =
      typeof errorBody?.message === "string" && errorBody.message !== ""
        ? errorBody.message
        : `the API answered ${response.status}`;
    throw new CrydenError("http", message, { status: response.status, code });
  }

  if (envelope === null || !("data" in envelope)) {
    throw new CrydenError("malformed", "the API answer was not in the expected envelope", {
      status: response.status,
    });
  }

  return envelope.data as T;
}

function ensureTrailingSlash(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

/**
 * Which of the topbar's four states the API is in, from a failure. The topbar
 * shows the real state; it is never told "connected" by a screen that has not
 * asked.
 */
export function statusFromError(error: unknown): "degraded" | "offline" {
  if (error instanceof CrydenError) {
    if (error.kind === "network" || error.kind === "timeout") return "offline";
    if (error.status !== null && error.status >= 500) return "degraded";
    if (error.kind === "malformed") return "degraded";
  }
  return "degraded";
}
