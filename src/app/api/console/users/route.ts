import { z } from "zod";

import { requireMutation, requireSession } from "@/server/auth/guard";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { readJsonBody } from "@/server/auth/routes";
import { USERS_PAGE_SIZE } from "@/server/cryden/admin";
import { browseUsers } from "@/server/users/browse";
import { createUserAccount } from "@/server/users/actions";

/**
 * `GET /api/console/users`: one page of accounts, for the operator whose session
 * cookie came with the request.
 *
 * A console route rather than a call from the page's server component, for the
 * reason the dashboard's route gives: the API's access token needs renewing when
 * it is close to expiry, and only a route handler can write the cookie that
 * renewal sets.
 *
 * No role check of its own. Reading accounts is what a `viewer` console account
 * may do, and whether the API agrees is the API's answer to give: a refusal
 * arrives as the section state that says so, worded once, in one place.
 */

export const dynamic = "force-dynamic";

/**
 * The query, checked rather than passed through.
 *
 * `limit` and `offset` are bounded so a hand-written URL cannot ask the console
 * to request an unbounded page or a page buffer of its own choosing. `q` is
 * bounded at 320 characters, which is longer than the 254 an address may be, so
 * the limit never refuses a real address and still stops a very long string from
 * becoming work before anyone looks at it.
 */
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(USERS_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().max(320).default(""),
});

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;

  const params = new URL(request.url).searchParams;
  const input: Record<string, string> = {};
  for (const key of ["limit", "offset", "q"] as const) {
    const value = params.get(key);
    if (value !== null) input[key] = value;
  }

  const parsed = querySchema.safeParse(input);
  if (!parsed.success) {
    return authorized.respond(
      jsonError(
        400,
        ERROR_CODES.invalidRequest,
        "That is not a page of accounts the console can ask for.",
      ),
    );
  }

  // Trimmed, and an empty search passed as absent rather than as `q=`. The API
  // reads both the same way, but a browser that sends `q=%20` would otherwise be
  // searching for an address made of a space.
  const query = parsed.data.q.trim();

  const page = await browseUsers({
    token: authorized.session.api.accessToken,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
    query: query === "" ? undefined : query,
  });

  return authorized.respond(jsonOk(page));
}

/**
 * The body an account creation accepts. The password's only bound is the API's
 * own policy, which is checked there where the breach check runs alongside it;
 * bounding it here at all would mean guessing at a rule the engine owns. The
 * email's bound is the address limit, the same one the query parameter uses.
 */
const createSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1),
});

/**
 * `POST /api/console/users`: register an account on the deployment.
 *
 * `requireMutation`, not `requireSession`: the console's viewer role is
 * read-only by the console's own rule, the same line the action route holds,
 * and the API runs its own admin gate behind the create path as well.
 *
 * The password travels in the request body only and is forwarded to the API's
 * `cryden.SignUp` path, where the engine's password policy, breach check and
 * rate limiter all run as they would at `POST /v1/signup`. The console adds
 * none of its own opinions about what makes a password acceptable, so a
 * violation arrives with the API's own stable rule names.
 */
export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;

  const body = await readJsonBody(request, createSchema);
  if (!body.ok) return authorized.respond(body.response);

  const result = await createUserAccount({
    token: authorized.session.api.accessToken,
    email: body.value.email,
    password: body.value.password,
  });

  if (result.state !== "ok") {
    const code = result.state === "empty" ? ERROR_CODES.notFound : result.code;
    return authorized.respond(jsonError(502, code ?? ERROR_CODES.conflict, result.detail));
  }
  return authorized.respond(jsonOk(result.data, { status: 201 }));
}
