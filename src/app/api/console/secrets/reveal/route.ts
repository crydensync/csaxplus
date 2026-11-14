import { z } from "zod";

import { requireMutation } from "@/server/auth/guard";
import { readJsonBody } from "@/server/auth/routes";
import { jsonOk } from "@/server/auth/response";
import { getConsoleStore } from "@/server/db";
import { withSecretGrant } from "@/server/auth/operator-grant";
import { secretFailure } from "@/server/secrets/http";
import { auditSecretAction, revealSecret } from "@/server/secrets/vault";

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
  return withSecretGrant(authorized, "secret_reveal", async () => {
    try {
      const store = getConsoleStore();
      const value = await revealSecret(store, body.value.name, body.value.source);
      await auditSecretAction(store, {
        id: authorized.session.operator.id,
        label: authorized.session.operator.label,
      }, "reveal", body.value.name);
      return jsonOk({ name: body.value.name, value });
    } catch (error) {
      try {
        await auditSecretAction(getConsoleStore(), {
          id: authorized.session.operator.id,
          label: authorized.session.operator.label,
        }, "reveal", body.value.name, "failure");
      } catch {}
      return secretFailure(error);
    }
  });
}
