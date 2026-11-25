import { z } from "zod";

import { requireMutation } from "@/server/auth/guard";
import { readJsonBody } from "@/server/auth/routes";
import { jsonOk } from "@/server/auth/response";
import { getConsoleStore } from "@/server/db";
import { secretFailure } from "@/server/secrets/http";
import { auditSecretAction, listSecrets, SecretVaultError } from "@/server/secrets/vault";

export const dynamic = "force-dynamic";
const schema = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
  source: z.enum(["environment", "file", "vault"]),
});

export async function POST(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const body = await readJsonBody(request, schema);
  if (!body.ok) return authorized.respond(body.response);
  try {
    const store = getConsoleStore();
    const available = await listSecrets(store);
    if (!available.some((secret) => secret.name === body.value.name && secret.source === body.value.source)) {
      await auditSecretAction(store, {
        id: authorized.session.operator.id,
        label: authorized.session.operator.label,
      }, "copy", body.value.name, "failure");
      return authorized.respond(secretFailure(new SecretVaultError(404, "secret_not_found", "That secret is no longer available.")));
    }
    await auditSecretAction(store, {
      id: authorized.session.operator.id,
      label: authorized.session.operator.label,
    }, "copy", body.value.name);
    return authorized.respond(jsonOk({ recorded: true }));
  } catch (error) {
    try {
      await auditSecretAction(getConsoleStore(), {
        id: authorized.session.operator.id,
        label: authorized.session.operator.label,
      }, "copy", body.value.name, "failure");
    } catch {}
    return authorized.respond(secretFailure(error));
  }
}
