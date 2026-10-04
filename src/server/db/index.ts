import "server-only";

import type { ConsoleConfig } from "../config/index";
import { getConfig } from "../config/index";
import { openPostgresStore, openSqliteStore } from "./drivers";
import type { ConsoleStore } from "./store";

/**
 * The console store: the console's own database, separate from the engine. It
 * holds console-owned step-up passkeys, step-up grants, the encrypted secret
 * vault, console audit entries and operator preferences.
 *
 * Which engine it runs on is the configuration's decision, not this module's:
 * `CSAX_STORE_URL` selects Postgres, otherwise a SQLite file.
 */

export type { ConsoleStore } from "./store";

export function openConsoleStore(config: ConsoleConfig): ConsoleStore {
  return config.store.kind === "postgres"
    ? openPostgresStore(config.store.url)
    : openSqliteStore(config.store.path);
}

/**
 * The process-wide store, cached on `globalThis` so a hot reload in development
 * does not open a second connection to the same file.
 */
const CACHE = Symbol.for("csaxplus.consoleStore");

type GlobalWithStore = typeof globalThis & { [CACHE]?: ConsoleStore };

export function getConsoleStore(): ConsoleStore {
  const global = globalThis as GlobalWithStore;
  global[CACHE] ??= openConsoleStore(getConfig());
  return global[CACHE];
}

/** Test hook. Not called from application code. */
export async function closeConsoleStore(): Promise<void> {
  const global = globalThis as GlobalWithStore;
  const store = global[CACHE];
  if (store === undefined) return;
  delete global[CACHE];
  await store.close();
}

export type BootReport = {
  dialect: "postgres" | "sqlite";
  applied: string[];
  skipped: number;
};

/**
 * Runs at startup, before any request is served. Returns null when
 * `SKIP_AUTO_MIGRATE` is set, which is what an operator who applies migrations
 * as a deliberate deploy step wants: the console then starts without touching
 * the schema, and the System screen in Tier 5 reports what is outstanding.
 */
export async function migrateOnBoot(): Promise<BootReport | null> {
  if (getConfig().skipAutoMigrate) return null;

  const store = getConsoleStore();
  const result = await store.migrate();
  return {
    dialect: store.dialect,
    applied: result.applied.map((migration) => migration.id),
    skipped: result.skipped,
  };
}
