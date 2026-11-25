import { requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { ERROR_CODES, jsonError, jsonOk } from "@/server/auth/response";
import { isUserIdSegment, setUserMetadata, deleteUserMetadata } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

const keyPattern = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;

async function readPath(context: { params: Promise<{ userId: string; key: string }> }) {
  const { userId, key } = await context.params;
  return isUserIdSegment(userId) && keyPattern.test(key) ? { userId, key } : null;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ userId: string; key: string }> },
): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const path = await readPath(context);
  if (path === null) {
    return authorized.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "Enter a valid claim name and account id."),
    );
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return authorized.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "Send a valid JSON body."),
    );
  }
  if (typeof raw !== "object" || raw === null || !Object.hasOwn(raw, "value")) {
    return authorized.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "A JSON value is required."),
    );
  }
  try {
    const metadata = await setUserMetadata({
      token: authorized.session.api.accessToken,
      ...path,
      value: (raw as { value: unknown }).value,
    });
    return authorized.respond(jsonOk(metadata));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string; key: string }> },
): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const path = await readPath(context);
  if (path === null) {
    return authorized.respond(
      jsonError(400, ERROR_CODES.invalidRequest, "Enter a valid claim name and account id."),
    );
  }
  try {
    const metadata = await deleteUserMetadata({
      token: authorized.session.api.accessToken,
      ...path,
    });
    return authorized.respond(jsonOk(metadata));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
