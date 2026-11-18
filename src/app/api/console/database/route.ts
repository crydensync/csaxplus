import { requireAdmin } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonOk } from "@/server/auth/response";
import { fetchAPIMigrationStatus, fetchDatabaseCatalog } from "@/server/cryden/admin";
import { readConsoleMigrationStatus } from "@/server/database/migrations";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  try {
    const token = authorized.session.api.accessToken;
    const [apiMigrations, catalog, consoleMigrations] = await Promise.all([
      fetchAPIMigrationStatus({ token }),
      fetchDatabaseCatalog({ token }),
      readConsoleMigrationStatus(),
    ]);
    return authorized.respond(
      jsonOk({ api_migrations: apiMigrations, catalog, console_migrations: consoleMigrations }),
    );
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }
}
