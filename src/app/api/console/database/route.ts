import { requireAdmin } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError, jsonOk } from "@/server/auth/response";
import { fetchAPIMigrationStatus, fetchDatabaseCatalog } from "@/server/cryden/admin";
import { readConsoleMigrationStatus } from "@/server/database/migrations";
import { CrydenError } from "@/server/cryden/http";

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
    if (error instanceof CrydenError && error.status === 404) {
      return authorized.respond(
        jsonError(
          503,
          "database_inspector_unavailable",
          "The CSAG instance does not include the database inspector routes. Build and restart CSAG from the database inspector feature branch.",
        ),
      );
    }
    return authorized.respond(responseForFailure(error));
  }
}
