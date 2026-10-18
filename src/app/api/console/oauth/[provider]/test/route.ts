import { requireMutation } from "@/server/auth/guard";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { testProvider } from "@/server/oauth/providers";

/**
 * `POST /api/console/oauth/{provider}/test`: probe one provider's authorize
 * endpoint on the operator's behalf.
 *
 * Own route rather than a verb under the list, because the provider is a
 * path segment the browser chose and `testOAuthProvider` checks it against
 * the provider-name grammar before the URL is built, so path syntax cannot
 * arrive here dressed as a provider name.
 *
 * `requireMutation` for a test that changes nothing? Yes, deliberately:
 * a test's cost is an outbound request from the deployment to the provider,
 * which is exactly what a CSRF or a viewer should not be able to spend, and
 * the API gates the path behind the admin check too.
 */

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;

  const { provider } = await context.params;
  if (!/^[a-z0-9-]{1,32}$/.test(provider)) {
    return authorized.respond(
      jsonError(
        400,
        ERROR_CODES.invalidRequest,
        "That is not a provider name the console can send.",
      ),
    );
  }

  const result = await testProvider({
    token: authorized.session.api.accessToken,
    provider,
  });

  if (result.state !== "ok") {
    const code = result.state === "empty" ? ERROR_CODES.notFound : result.code;
    return authorized.respond(jsonError(502, code ?? ERROR_CODES.conflict, result.detail));
  }
  return authorized.respond(jsonOk(result.data));
}
