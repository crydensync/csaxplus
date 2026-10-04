import { requireSession } from "@/server/auth/guard";
import { jsonOk } from "@/server/auth/response";
import { sessionSummary } from "@/server/auth/routes";

/**
 * `GET /api/auth/session`: who the console thinks is signed in, and the token
 * a mutation has to echo.
 *
 * The session cookie is httpOnly and the CSRF token lives inside it, so the page
 * cannot read either. This is how the browser gets them: the operator's own id,
 * their label and role, and the double-submit value. Another origin cannot read
 * this answer, which is exactly what makes echoing the token meaningful.
 *
 * Reading this also renews the API tokens when they are nearly done, so a tab
 * that sits open does not find itself signed out at the fifteen minute mark.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;

  return authorized.respond(
    jsonOk({
      ...sessionSummary(authorized.session),
      csrf: authorized.session.csrf,
    }),
  );
}
