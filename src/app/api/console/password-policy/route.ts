import { z } from "zod";

import { requireMutation, requireSession } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk } from "@/server/auth/response";
import { updatePasswordPolicy } from "@/server/cryden/admin";
import { readPasswordMigration } from "@/server/password-policy/migration";

/** Read the password hash migration report for the current operator. */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireSession(request);
  if (!authorized.ok) return authorized.response;

  const report = await readPasswordMigration({ token: authorized.session.api.accessToken });
  return authorized.respond(jsonOk(report));
}

const policySchema = z.object({
  min_length: z.number().int().min(8).max(72),
  max_length: z.number().int().min(8).max(72),
  require_uppercase: z.boolean(),
  require_lowercase: z.boolean(),
  require_digit: z.boolean(),
  require_symbol: z.boolean(),
});

export async function PUT(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return authorized.respond(jsonError(400, "invalid_request", "Send a valid JSON body."));
  }
  const parsed = policySchema.safeParse(raw);
  if (!parsed.success || parsed.data.max_length < parsed.data.min_length) {
    return authorized.respond(
      jsonError(400, "invalid_request", "Enter a maximum length at least as large as the minimum."),
    );
  }

  try {
    const policy = await updatePasswordPolicy({
      token: authorized.session.api.accessToken,
      policy: parsed.data,
    });
    return authorized.respond(jsonOk(policy));
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
