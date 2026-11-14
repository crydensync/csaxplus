import { requireAdmin, requireMutation } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk } from "@/server/auth/response";
import { fetchDatabaseProvider, saveDatabaseProvider } from "@/server/cryden/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  try {
    return authorized.respond(
      jsonOk(await fetchDatabaseProvider({ token: authorized.session.api.accessToken })),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}

const inputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  dsn: z.string().trim().min(1).max(4096),
  max_rows: z.number().int().min(1).max(500),
});

export async function PUT(request: Request): Promise<Response> {
  const authorized = await requireMutation(request);
  if (!authorized.ok) return authorized.response;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return authorized.respond(
      jsonError(400, "invalid_request", "Enter a label, PostgreSQL DSN, and row limit."),
    );
  try {
    return authorized.respond(
      jsonOk(
        await saveDatabaseProvider({
          token: authorized.session.api.accessToken,
          input: parsed.data,
        }),
      ),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
