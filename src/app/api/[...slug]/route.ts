import { ERROR_CODES, jsonError } from "@/server/auth/response";

/**
 * The console's API surface is closed: a path under `/api` that no route handler
 * claims answers JSON, not a page.
 *
 * Without this, an unmatched `/api/...` path would fall through to the console's
 * catch-all page under `(console)` and answer a redirect into the sign-in
 * screen: HTML, and a 307, to something that asked for JSON. A caller would have
 * to read a login page to find out it had the wrong URL.
 *
 * Every method answers the same way, so a wrong path is a 404 rather than a 405
 * about a method the caller was never going to reach.
 */

export const dynamic = "force-dynamic";

function noSuchEndpoint(): Response {
  return jsonError(404, ERROR_CODES.notFound, "There is no console endpoint at this path.");
}

export const GET = noSuchEndpoint;
export const POST = noSuchEndpoint;
export const PUT = noSuchEndpoint;
export const PATCH = noSuchEndpoint;
export const DELETE = noSuchEndpoint;
