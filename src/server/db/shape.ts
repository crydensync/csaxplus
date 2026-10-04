import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";
import { getTableConfig as getSqliteTableConfig } from "drizzle-orm/sqlite-core";

import { consoleSchema as pgSchema } from "./schema.postgres";
import { consoleSchema as sqliteSchema } from "./schema.sqlite";

/**
 * A dialect-neutral description of the console store schema.
 *
 * The two dialect files are written out by hand, so nothing at compile time
 * stops one of them gaining a column the other lacks. This projection is what
 * `tests/unit/db-store.test.ts` compares: it drops everything that is a
 * spelling difference between the engines and keeps what the column means.
 *
 * `uuid` is deliberately not a kind here. Postgres stores an id as `uuid` and
 * SQLite as `text`, and both hold the same value; calling one of them the odd
 * one out would make the comparison report a difference that does not exist.
 * The choice of `uuid` in the Postgres file is a per-dialect quality that the
 * other dialect cannot express, not a disagreement about the data.
 */

export type NeutralKind = "text" | "integer" | "boolean" | "timestamp" | "json";

export type NeutralColumn = {
  name: string;
  kind: NeutralKind;
  notNull: boolean;
  primaryKey: boolean;
  hasDefault: boolean;
  /** Unique on its own, from a column-level `.unique()`. */
  unique: boolean;
};

export type NeutralTable = {
  name: string;
  columns: NeutralColumn[];
  /** Column-name sets behind a unique index, each sorted. */
  uniqueSets: string[][];
};

export type NeutralShape = Record<string, NeutralTable>;

/** Column type names the two drizzle cores use, mapped onto the shared kinds. */
const KIND_BY_COLUMN_TYPE: Record<string, NeutralKind> = {
  PgUUID: "text",
  PgText: "text",
  SQLiteText: "text",
  PgInteger: "integer",
  SQLiteInteger: "integer",
  PgBoolean: "boolean",
  SQLiteBoolean: "boolean",
  PgTimestamp: "timestamp",
  SQLiteTimestamp: "timestamp",
  PgJsonb: "json",
  SQLiteTextJson: "json",
};

type RawColumn = {
  name: string;
  columnType: string;
  notNull: boolean;
  primary: boolean;
  hasDefault: boolean;
  isUnique: boolean;
};

type RawIndex = {
  config: {
    unique?: boolean;
    columns: ReadonlyArray<{ name: string }>;
  };
};

type RawTableConfig = {
  name: string;
  columns: ReadonlyArray<RawColumn>;
  indexes: ReadonlyArray<RawIndex>;
};

function kindOf(column: RawColumn): NeutralKind {
  const kind = KIND_BY_COLUMN_TYPE[column.columnType];
  if (kind === undefined) {
    // A new column type would otherwise be silently absent from the comparison,
    // which is the one failure this projection exists to prevent.
    throw new Error(`no neutral kind for column type ${column.columnType}`);
  }
  return kind;
}

function project(config: RawTableConfig): NeutralTable {
  const columns = config.columns.map<NeutralColumn>((column) => ({
    name: column.name,
    kind: kindOf(column),
    notNull: column.notNull,
    primaryKey: column.primary,
    hasDefault: column.hasDefault,
    unique: column.isUnique,
  }));

  return { name: config.name, columns, uniqueSets: collectUniqueSets(config) };
}

/**
 * Every set of columns the schema makes unique, each sorted, the list sorted.
 *
 * A column-level `.unique()` and a composite `uniqueIndex` reach the database
 * the same way, as a unique index, so both are collected here: a one-column set
 * is still a set. Leaving the column-level ones out would make the comparison
 * against a real database report a difference that is only in how the schema
 * was written.
 */
function collectUniqueSets(config: RawTableConfig): string[][] {
  const sets = config.columns.filter((column) => column.isUnique).map((column) => [column.name]);

  for (const entry of config.indexes) {
    if (entry.config.unique !== true) continue;
    sets.push(entry.config.columns.map((column) => column.name).sort());
  }

  const seen = new Set<string>();
  return sets
    .map((set) => set.sort())
    .filter((set) => {
      const key = set.join(",");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareSets);
}

function compareSets(left: string[], right: string[]): number {
  return left.join(",").localeCompare(right.join(","));
}

function projectAll(schema: Record<string, unknown>): NeutralShape {
  const shape: NeutralShape = {};
  for (const key of Object.keys(schema).sort()) {
    const config = schema[key] as RawTableConfig;
    shape[key] = project(config);
  }
  return shape;
}

/** The Postgres schema as neutral tables, keyed by the symbol name in `consoleSchema`. */
export function pgShape(): NeutralShape {
  const raw: Record<string, unknown> = {};
  for (const [key, table] of Object.entries(pgSchema)) {
    raw[key] = getPgTableConfig(table) as unknown as RawTableConfig;
  }
  return projectAll(raw);
}

/** The SQLite schema as neutral tables, keyed the same way. */
export function sqliteShape(): NeutralShape {
  const raw: Record<string, unknown> = {};
  for (const [key, table] of Object.entries(sqliteSchema)) {
    raw[key] = getSqliteTableConfig(table) as unknown as RawTableConfig;
  }
  return projectAll(raw);
}

/** The SQLite storage type each drizzle column type is created as. */
const STORAGE_BY_COLUMN_TYPE: Record<string, string> = {
  SQLiteText: "text",
  SQLiteTextJson: "text",
  SQLiteInteger: "integer",
  SQLiteBoolean: "integer",
  SQLiteTimestamp: "integer",
};

/**
 * What the SQLite schema says the database should look like, in the terms
 * `pragma table_info` reports: names, storage types, nullability, primary keys
 * and defaults. `tests/unit/db-store.test.ts` compares this against a database
 * the migrations actually created, which is what keeps the typed schema and the
 * DDL from drifting apart.
 */
export type StorageColumn = {
  name: string;
  storage: string;
  notNull: boolean;
  primaryKey: boolean;
  hasDefault: boolean;
};

export type StorageTable = {
  name: string;
  columns: StorageColumn[];
  uniqueSets: string[][];
};

export function sqliteStorageShape(): Record<string, StorageTable> {
  const shape: Record<string, StorageTable> = {};
  for (const [key, table] of Object.entries(sqliteSchema)) {
    const config = getSqliteTableConfig(table) as unknown as RawTableConfig;
    const columns = config.columns.map<StorageColumn>((column) => {
      const storage = STORAGE_BY_COLUMN_TYPE[column.columnType];
      if (storage === undefined) {
        throw new Error(`no SQLite storage type for column type ${column.columnType}`);
      }
      return {
        name: column.name,
        storage,
        notNull: column.notNull,
        primaryKey: column.primary,
        hasDefault: column.hasDefault,
      };
    });

    shape[key] = { name: config.name, columns, uniqueSets: collectUniqueSets(config) };
  }
  return shape;
}

/** Table and column names, for a readable failure message. */ export function describeShape(
  shape: NeutralShape,
): string {
  return Object.entries(shape)
    .map(([key, table]) => {
      const columns = table.columns
        .map((column) => `${column.name}:${column.kind}${column.notNull ? "" : "?"}`)
        .join(", ");
      const unique =
        table.uniqueSets.length > 0
          ? ` unique(${table.uniqueSets.map((set) => set.join("+")).join(", ")})`
          : "";
      return `${key} (${table.name}): ${columns}${unique}`;
    })
    .join("\n");
}
