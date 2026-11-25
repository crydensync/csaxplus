import { z } from "zod";

import { requireMutation, requireSecretsAccess } from "@/server/auth/guard";
import { readJsonBody } from "@/server/auth/routes";
import { jsonOk } from "@/server/auth/response";
import { getConsoleStore } from "@/server/db";
import { withSecretGrant } from "@/server/auth/operator-grant";
import { secretFailure } from "@/server/secrets/http";
import { auditSecretAction, createVaultSecret, listSecrets } from "@/server/secrets/vault";

export const dynamic = "force-dynamic";
const namePattern = /^[A-Z][A-Z0-9_]{0,63}$/;
const createSchema = z.object({
  name: z.string().regex(namePattern),
  value: z.string().min(1).max(16_384),
  tags: z.array(z.string().trim().min(1).max(32)).max(10).default([]),
});

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireSecretsAccess(request);
  if (!authorized.ok) return authorized.response;
  try {
    return authorized.respond(jsonOk({ secrets: await listSecrets(getConsoleStore()) }));
  } catch (error) {
    return authorized.respond(secretFailure(error));
  }
}

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const body = await readJsonBody(request, createSchema);
  if (!body.ok) return authorized.respond(body.response);
  return withSecretGrant(authorized, "secret_mutation", async () => {
    try {
      await createVaultSecret(getConsoleStore(), {
        id: authorized.session.operator.id,
        label: authorized.session.operator.label,
      }, body.value);
      return jsonOk({ created: true });
    } catch (error) {
      try {
        await auditSecretAction(getConsoleStore(), {
          id: authorized.session.operator.id,
          label: authorized.session.operator.label,
        }, "create", body.value.name, "failure");
      } catch {}
      return secretFailure(error);
    }
  });
}
