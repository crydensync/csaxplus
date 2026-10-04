import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { SqlDriver } from "./drivers";
import type { MigrationResult, MigrationStatus } from "./runner";
import { migrationStatus, runMigrations } from "./runner";
import type { consoleSchema as pgSchema } from "./schema.postgres";
import type { consoleSchema as sqliteSchema } from "./schema.sqlite";

/**
 * An opened console store: the raw driver the migration runner and repositories
 * use, the drizzle handle that gives typed queries on the same connection, and
 * the two operations that belong to a store rather than to a driver.
 *
 * Narrowing on `dialect` narrows `orm` as well, so a caller cannot hand a SQLite
 * handle to code that expects Postgres column types.
 */

export type SqliteStore = {
  dialect: "sqlite";
  driver: SqlDriver;
  orm: BetterSQLite3Database<typeof sqliteSchema>;
};

export type PostgresStore = {
  dialect: "postgres";
  driver: SqlDriver;
  orm: PostgresJsDatabase<typeof pgSchema>;
};

export type OpenedStore = SqliteStore | PostgresStore;

type StoreMethods = {
  /** Applies every migration this database has not run yet. */
  migrate(): Promise<MigrationResult>;
  status(): Promise<MigrationStatus>;
  close(): Promise<void>;
};

export type ConsoleStore = StoreMethods & OpenedStore;

export function withMethods(opened: OpenedStore): ConsoleStore {
  return Object.assign(opened, {
    migrate: () => runMigrations(opened.driver),
    status: () => migrationStatus(opened.driver),
    close: () => opened.driver.close(),
  }) satisfies ConsoleStore;
}
