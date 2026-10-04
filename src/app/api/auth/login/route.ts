import { z } from "zod";

import { responseForFailure } from "@/server/auth/failures";
import { signIn } from "@/server/auth/flow";
import { requireSameOrigin, withSetCookies } from "@/server/auth/guard";
import { startPending } from "@/server/auth/pending";
import { jsonOk } from "@/server/auth/response";
import {
  pendingSetCookie,
  readJsonBody,
  sessionSetCookie,
  sessionSummary,
} from "@/server/auth/routes";

/**
 * `POST /api/auth/login`: the console's password step.
 *
 * Three answers, all of them from the API and none of them invented here. Tokens
 * end in a session cookie. A pause ends in a cookie holding the pending token,
 * because the API's second factors are completed by two more requests and the
 * browser must not be handed the token that proves the first one. A refusal is
 * passed through with the API's own code, so the form can tell "invalid email or
 * password" from "account temporarily locked" from "too many attempts".
 *
 * The origin check is the one guard that applies before there is a session. It
 * is what stops another site from driving a sign-in: a cross-site form post
 * carries an Origin this refuses. There is no CSRF token to check, because there
 * is no session yet to hold one.
 */

/** Bounded, so a very long value cannot become work before anyone looks at it. */
const bodySchema = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});

export async function POST(request: Request): Promise<Response> {
  const origin = requireSameOrigin(request);
  if (origin !== null) return origin;

  const body = await readJsonBody(request, bodySchema);
  if (!body.ok) return body.response;

  try {
    const outcome = await signIn(body.value.email, body.value.password);

    if (outcome.kind === "second-factor") {
      const cookie = await pendingSetCookie(startPending(outcome.paused, body.value.email));
      return withSetCookies(
        jsonOk({ secondFactorRequired: true, methods: outcome.paused.methods }),
        [cookie],
      );
    }

    return withSetCookies(jsonOk(sessionSummary(outcome.session)), [
      await sessionSetCookie(outcome.session),
    ]);
  } catch (error) {
    return responseForFailure(error);
  }
}
