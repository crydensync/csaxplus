import type { SqlDriver } from "./drivers";
import {
  createMigrationsTableSql,
  MIGRATIONS,
  MIGRATIONS_TABLE,
  type Migration,
} from "./migrations";

/**
 * The migration runner. It reads which migrations the database has already
 * applied from the `console_migrations` table, applies the rest in order, and
 * records each one in the same transaction that created its tables, so a
 * failure cannot leave a migration marked applied when it is not.
 *
 * It writes nothing to the console: the caller decides how to report, which is
 * what lets a test drive it directly.
 */

export type AppliedMigration = {
  id: string;
  name: string;
  appliedAt: Date;
};

export type MigrationStatus = {
  applied: AppliedMigration[];
  pending: Migration[];
  /** id of the last applied migration, or null on a store with none. */
  current: string | null;
};

export type MigrationResult = {
  applied: Migration[];
  skipped: number;
};

type AppliedRow = { id: string; name: string; applied_at: unknown };

export async function ensureMigrationsTable(driver: SqlDriver): Promise<void> {
  await driver.execute(createMigrationsTableSql(driver.dialect));
}

/** The value `applied_at` takes on this dialect. */
function appliedAtValue(driver: SqlDriver, at: Date): Date | number {
  return driver.dialect === "postgres" ? at : at.getTime();
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") return new Date(value);
  throw new Error("console_migrations.applied_at is not a date");
}

export async function readApplied(driver: SqlDriver): Promise<AppliedMigration[]> {
  await ensureMigrationsTable(driver);
  const rows = await driver.query<AppliedRow>(
    `select id, name, applied_at from ${MIGRATIONS_TABLE} order by id`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    appliedAt: toDate(row.applied_at),
  }));
}

export async function migrationStatus(driver: SqlDriver): Promise<MigrationStatus> {
  const applied = await readApplied(driver);
  const done = new Set(applied.map((entry) => entry.id));
  const pending = MIGRATIONS.filter((migration) => !done.has(migration.id));
  const last = applied.at(-1);
  return { applied, pending, current: last === undefined ? null : last.id };
}

/** Applies every migration this database has not run yet. */
export async function runMigrations(driver: SqlDriver): Promise<MigrationResult> {
  const status = await migrationStatus(driver);
  const applied: Migration[] = [];

  for (const migration of status.pending) {
    await driver.runAtomically([
      ...migration.statements[driver.dialect].map((sql) => ({ sql })),
      // The record of the migration is written by the same transaction that
      // created its tables, so a crash cannot leave it marked applied.
      {
        sql: `insert into ${MIGRATIONS_TABLE} (id, name, applied_at) values (?, ?, ?)`,
        params: [migration.id, migration.name, appliedAtValue(driver, new Date())],
      },
    ]);
    applied.push(migration);
  }

  return { applied, skipped: status.applied.length };
}
