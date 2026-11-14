import { ConfigError } from "./server/config/errors";
import { getConfig } from "./server/config";
import { logJson } from "./server/logging/json";

/**
 * Node-only boot. `instrumentation.ts` calls this only when NEXT_RUNTIME is
 * nodejs, so the console store's driver code never reaches the edge bundle.
 *
 * Two things happen here, in this order: the configuration is validated, then
 * the console store is migrated. A failure in either stops the process with a
 * readable message rather than surfacing later on whichever screen happens to
 * touch the thing that is wrong.
 */
export async function startConsole(): Promise<void> {
  try {
    getConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      logJson("error", "console configuration is invalid", "error", {
        detail: error.message,
      });
      process.exit(1);
    }
    throw error;
  }

  try {
    const { migrateOnBoot } = await import("./server/db/index");
    const report = await migrateOnBoot();
    const config = getConfig();
    if (report === null) {
      logJson("warn", "console store migrations skipped", config.logLevel, {
        reason: "SKIP_AUTO_MIGRATE is set",
      });
    } else {
      logJson("info", "console store ready", config.logLevel, {
        dialect: report.dialect,
        applied_migration_count: report.applied.length,
        already_applied_migration_count: report.skipped,
      });
    }
  } catch (error) {
    logJson("error", "console store initialization failed", "error", {
      error_type: error instanceof Error ? error.name : "UnknownError",
      detail: "Check console database connectivity and migration state.",
    });
    process.exit(1);
  }
}
