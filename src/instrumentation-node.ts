import { ConfigError } from "./server/config/errors";
import { getConfig } from "./server/config";

/**
 * Node-only boot check. `instrumentation.ts` calls this only when NEXT_RUNTIME is
 * nodejs, so the console store's driver code never reaches the edge bundle.
 */
export function checkConfiguration(): void {
  try {
    getConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`csax+ cannot start.\n${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
