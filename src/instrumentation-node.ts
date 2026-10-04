import { ConfigError } from "./server/config/errors";
import { getConfig } from "./server/config";

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
      console.error(`csax+ cannot start.\n${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  try {
    const { migrateOnBoot } = await import("./server/db/index");
    const report = await migrateOnBoot();
    if (report === null) {
      console.info("csax+ store migrations skipped (SKIP_AUTO_MIGRATE is set)");
    } else if (report.applied.length > 0) {
      console.info(`csax+ store ready on ${report.dialect}, applied ${report.applied.join(", ")}`);
    }
  } catch (error) {
    console.error(
      `csax+ cannot start: the console store is not usable.\n${(error as Error).message}`,
    );
    process.exit(1);
  }
}
