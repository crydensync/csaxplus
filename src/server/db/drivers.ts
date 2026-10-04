// Type-only, so nothing is imported at runtime and the native binding stays out
// of the bundle. The values come from `runtimeRequire` at open time.
import type BetterSqlite3 from "better-sqlite3";
import type postgres from "postgres";

import { ensureDir, pathApi, runtimeRequire } from "../node/builtins";
import type { Dialect } from "./migrations";
import { consoleSchema as pgSchema } from "./schema.postgres";
import { consoleSchema as sqliteSchema } from "./schema.sqlite";
import { withMethods, type ConsoleStore } from "./store";

/**
 * The narrow surface the console store needs from a database driver.
 *
 * Statements are written with `?` placeholders and the Postgres driver rewrites
 * them to `$1`, `$2` and so on, so a repository written once runs on both
 * engines. Values are always passed as parameters, never interpolated.
 */
export interface SqlDriver {
  readonly dialect: Dialect;
  query<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  execute(sql: string, params?: readonly unknown[]): Promise<void>;
  /**
   * Applies steps as one all-or-nothing unit.
   *
   * Narrow on purpose: it is what the migration runner needs, a batch of DDL
   * plus the row that records it. The general read-modify-write transaction
   * that the vault and the passkey store will want is a separate, larger
   * problem, and inventing it before something needs it would be guessing at
   * its shape.
   */
  runAtomically(steps: readonly SqlStep[]): Promise<void>;
  close(): Promise<void>;
}

export type SqlStep = {
  sql: string;
  params?: readonly unknown[];
};

/**
 * Loads a module at call time, so no bundler sees the specifier.
 *
 * `drizzle-orm/better-sqlite3` statically requires `better-sqlite3`, which
 * requires `fs` and a native binding, and Next compiles `instrumentation.ts`
 * for the edge runtime as well as for Node. An ordinary import of it, static or
 * dynamic, made the edge compile fail on `Can't resolve 'fs'` for code the edge
 * never runs. Every one of these modules is loaded this way for that reason.
 */
function loadModule<T>(specifier: string): T {
  return runtimeRequire<T>(specifier);
}

/** Rewrites the neutral `?` placeholders into the numbered form Postgres uses. */
export function toNumberedPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

/**
 * Opens the SQLite file, creating the directory that holds it if needed. WAL
 * journalling is on so a read does not block a write, which matters when the
 * console is serving a request while a migration or an audit insert runs.
 */
export function openSqliteStore(file: string): ConsoleStore {
  const path = pathApi();
  const absolute = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  ensureDir(path.dirname(absolute));

  const Database = runtimeRequire<typeof BetterSqlite3>("better-sqlite3");
  const db = new Database(absolute);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const driver: SqlDriver = {
    dialect: "sqlite",
    async query<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },
    async execute(sql: string, params: readonly unknown[] = []): Promise<void> {
      db.prepare(sql).run(...params);
    },
    async runAtomically(steps: readonly SqlStep[]): Promise<void> {
      // better-sqlite3 runs its transaction callback synchronously, so every
      // step goes in without an await that could interleave another request
      // onto this connection half way through.
      const run = db.transaction(() => {
        for (const step of steps) db.prepare(step.sql).run(...(step.params ?? []));
      });
      run();
    },
    async close(): Promise<void> {
      db.close();
    },
  };

  const { drizzle } = loadModule<typeof import("drizzle-orm/better-sqlite3")>(
    "drizzle-orm/better-sqlite3",
  );
  return withMethods({ dialect: "sqlite", driver, orm: drizzle(db, { schema: sqliteSchema }) });
}

type PostgresClient = postgres.Sql<Record<string, never>>;

/** postgres.js is published twice, and the two builds disagree about `default`. */
type PostgresModule = typeof postgres | { default: typeof postgres };

/**
 * postgres.js exposes the same factory two ways depending on which build the
 * runtime resolved. The CommonJS build (`export = postgres`) hands the factory
 * back as the module itself, with the error class and the case helpers hanging
 * off it; the ESM build, and a bundler's interop wrapper around either, puts it
 * on `default`. `runtimeRequire` reaches the CommonJS one, so `.default` alone
 * was undefined, and this path never ran to say so until a real Postgres was
 * wired into the test suite and answered `pg.default is not a function`.
 */
function postgresFactory(module: PostgresModule): typeof postgres {
  return typeof module === "function" ? module : module.default;
}

type PgParams = postgres.ParameterOrJSON<never>[];

/**
 * Widens the parameter types and renders a `Date` the way this client needs it.
 *
 * postgres-js types its parameters more narrowly than a neutral driver surface
 * can express, and it turns a `Date` into an ISO string itself, so at first
 * sight nothing is needed here. It is: `drizzle(client, ...)` below runs
 * drizzle's `postgres-js` driver, and that driver replaces the parsers and
 * serializers for the date and timestamp type OIDs with a pass-through, because
 * drizzle converts its own column values before the driver sees them. That takes
 * postgres-js's `Date` handling away from the raw `unsafe` path as a side
 * effect, and an unencoded `Date` then reaches the wire and throws inside
 * `Buffer.byteLength`. Sending the ISO 8601 string Postgres expects keeps the
 * neutral surface working, and it is what drizzle sends for its own timestamp
 * columns anyway.
 *
 * Only the wrapper type is widened, at this one boundary and nowhere else; a
 * value that is not a `Date` travels exactly as the caller passed it.
 */
function pgParams(params: readonly unknown[]): PgParams {
  return params.map((value) => (value instanceof Date ? value.toISOString() : value)) as PgParams;
}

/**
 * Opens a Postgres pool for the console store. `max` is small on purpose: the
 * console is a single-operator tool in front of the API, and a large pool would
 * only take connections away from the engine.
 */
export function openPostgresStore(url: string): ConsoleStore {
  const pg = postgresFactory(loadModule<PostgresModule>("postgres"));
  const client: PostgresClient = pg(url, { max: 5, idle_timeout: 20 });

  const driver: SqlDriver = {
    dialect: "postgres",
    async query<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      const rows = await client.unsafe(toNumberedPlaceholders(sql), pgParams(params));
      return rows as unknown as T[];
    },
    async execute(sql: string, params: readonly unknown[] = []): Promise<void> {
      await client.unsafe(toNumberedPlaceholders(sql), pgParams(params));
    },
    async runAtomically(steps: readonly SqlStep[]): Promise<void> {
      // `begin` checks out one connection for the callback. Sending BEGIN over
      // the pool instead would put the COMMIT on whichever connection answered
      // next, which is not the same transaction.
      await client.begin(async (tx) => {
        for (const step of steps) {
          await tx.unsafe(toNumberedPlaceholders(step.sql), pgParams(step.params ?? []));
        }
      });
    },
    async close(): Promise<void> {
      await client.end({ timeout: 5 });
    },
  };

  const { drizzle } =
    loadModule<typeof import("drizzle-orm/postgres-js")>("drizzle-orm/postgres-js");
  return withMethods({ dialect: "postgres", driver, orm: drizzle(client, { schema: pgSchema }) });
}
