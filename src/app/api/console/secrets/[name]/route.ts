import { z } from "zod";

import { requireMutation } from "@/server/auth/guard";
import { readJsonBody } from "@/server/auth/routes";
import { jsonError, jsonOk, ERROR_CODES } from "@/server/auth/response";
import { getConsoleStore } from "@/server/db";
import { withSecretGrant } from "@/server/auth/operator-grant";
import { secretFailure } from "@/server/secrets/http";
import { auditSecretAction, deleteVaultSecret, updateVaultSecret } from "@/server/secrets/vault";

export const dynamic = "force-dynamic";
const namePattern = /^[A-Z][A-Z0-9_]{0,63}$/;
const updateSchema = z.object({
  value: z.string().min(1).max(16_384).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
}).refine((value) => value.value !== undefined || value.tags !== undefined);

type Context = { params: Promise<{ name: string }> };

export async function PUT(request: Request, context: Context): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const { name } = await context.params;
  if (!namePattern.test(name))
    return authorized.respond(jsonError(400, ERROR_CODES.invalidRequest, "That secret name is invalid."));
  const body = await readJsonBody(request, updateSchema);
  if (!body.ok) return authorized.respond(body.response);
  return withSecretGrant(authorized, "secret_mutation", async () => {
    try {
      await updateVaultSecret(getConsoleStore(), {
        id: authorized.session.operator.id,
        label: authorized.session.operator.label,
      }, { name, ...body.value });
      return jsonOk({ updated: true });
    } catch (error) {
      try {
        await auditSecretAction(getConsoleStore(), {
          id: authorized.session.operator.id,
          label: authorized.session.operator.label,
        }, "update", name, "failure");
      } catch {}
      return secretFailure(error);
    }
  });
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const { name } = await context.params;
  if (!namePattern.test(name))
    return authorized.respond(jsonError(400, ERROR_CODES.invalidRequest, "That secret name is invalid."));
  return withSecretGrant(authorized, "secret_mutation", async () => {
    try {
      await deleteVaultSecret(getConsoleStore(), {
        id: authorized.session.operator.id,
        label: authorized.session.operator.label,
      }, name);
      return jsonOk({ deleted: true });
    } catch (error) {
      try {
        await auditSecretAction(getConsoleStore(), {
          id: authorized.session.operator.id,
          label: authorized.session.operator.label,
        }, "delete", name, "failure");
      } catch {}
      return secretFailure(error);
    }
  });
}
