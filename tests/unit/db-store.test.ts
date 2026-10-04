import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openSqliteStore, toNumberedPlaceholders, type SqlDriver } from "@/server/db/drivers";
import { MIGRATIONS, MIGRATIONS_TABLE } from "@/server/db/migrations";
import { pgShape, sqliteShape, sqliteStorageShape } from "@/server/db/shape";
import { consoleSchema as sqliteSchema } from "@/server/db/schema.sqlite";

/**
 * These tests run against a real SQLite file, not a stub: the migration runner,
 * the driver and the DDL are the ones the console uses at boot. The Postgres
 * half of the schema is compared structurally instead, because this environment
 * has no Postgres to run it against; that is noted in docs/build/PROGRESS.md.
 */

const opened: SqlDriver[] = [];
const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "csax-store-"));
  dirs.push(dir);
  return dir;
}

async function freshStore() {
  const file = join(tempDir(), "console.sqlite");
  const store = openSqliteStore(file);
  opened.push(store.driver);
  return store;
}

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.close();
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

async function tableNames(driver: SqlDriver): Promise<string[]> {
  const rows = await driver.query<{ name: string }>(
    `select name from sqlite_master where type = 'table' order by name`,
  );
  return rows.map((row) => row.name);
}

describe("migration runner", () => {
  it("creates every table on a fresh database and records what it applied", async () => {
    const store = await freshStore();
    const result = await store.migrate();

    expect(result.applied.map((migration) => migration.id)).toEqual(
      MIGRATIONS.map((migration) => migration.id),
    );
    expect(result.skipped).toBe(0);

    const names = await tableNames(store.driver);
    for (const table of Object.values(sqliteStorageShape())) {
      expect(names).toContain(table.name);
    }
    expect(names).toContain(MIGRATIONS_TABLE);
  });

  it("does nothing on a second run", async () => {
    const store = await freshStore();
    await store.migrate();

    const second = await store.migrate();
    expect(second.applied).toEqual([]);
    expect(second.skipped).toBe(MIGRATIONS.length);

    const status = await store.status();
    expect(status.pending).toEqual([]);
    expect(status.current).toBe(MIGRATIONS.at(-1)?.id);
  });

  it("reports what is outstanding without applying it", async () => {
    const store = await freshStore();

    const status = await store.status();
    expect(status.applied).toEqual([]);
    expect(status.current).toBeNull();
    expect(status.pending.map((migration) => migration.id)).toEqual(
      MIGRATIONS.map((migration) => migration.id),
    );

    // Asking must not have created anything beyond its own bookkeeping table.
    expect(await tableNames(store.driver)).toEqual([MIGRATIONS_TABLE]);
  });

  it("leaves nothing behind when a migration fails part way through", async () => {
    const store = await freshStore();
    const driver = store.driver;

    await expect(
      driver.runAtomically([
        { sql: "create table partially_applied (id text primary key not null)" },
        { sql: "this is not sql" },
      ]),
    ).rejects.toThrow();

    expect(await tableNames(driver)).not.toContain("partially_applied");
  });
});

describe("the schema the migrations create", () => {
  it("is the schema the typed table definitions describe", async () => {
    const store = await freshStore();
    await store.migrate();

    const expected = sqliteStorageShape();
    for (const [key, table] of Object.entries(expected)) {
      const columns = await store.driver.query<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>(`select name, type, "notnull", dflt_value, pk from pragma_table_info(?) order by cid`, [
        table.name,
      ]);

      expect(
        columns.map((column) => ({
          name: column.name,
          storage: column.type.toLowerCase(),
          notNull: column.notnull === 1,
          primaryKey: column.pk > 0,
          hasDefault: column.dflt_value !== null,
        })),
        `${key}: ${table.name}`,
      ).toEqual(table.columns);

      // Unique indexes are how both a column-level UNIQUE and a composite one
      // reach the database. SQLite also builds one for a text primary key; that
      // one is reported as origin 'pk' and is not a declaration of its own.
      const indexes = await store.driver.query<{
        name: string;
        unique: number;
        origin: string;
      }>(`select name, "unique", origin from pragma_index_list(?)`, [table.name]);

      const uniqueSets: string[][] = [];
      for (const index of indexes) {
        if (index.unique !== 1 || index.origin === "pk") continue;
        const members = await store.driver.query<{ name: string }>(
          `select name from pragma_index_info(?)`,
          [index.name],
        );
        uniqueSets.push(members.map((member) => member.name).sort());
      }

      expect(uniqueSets.sort(), `${key}: unique indexes`).toEqual(table.uniqueSets);
    }
  });

  it("is structurally the same schema in both dialects", () => {
    const postgres = pgShape();
    const sqlite = sqliteShape();

    expect(Object.keys(postgres)).toEqual(Object.keys(sqlite));
    for (const key of Object.keys(postgres)) {
      expect(postgres[key], key).toEqual(sqlite[key]);
    }
  });

  it("covers every table the console store declares", () => {
    expect(Object.keys(sqliteShape()).sort()).toEqual(Object.keys(sqliteSchema).sort());
  });
});

describe("the store through the typed handle", () => {
  it("round-trips a row and refuses a duplicate where the schema says unique", async () => {
    const store = await freshStore();
    await store.migrate();
    if (store.dialect !== "sqlite") throw new Error("expected the SQLite store");

    const now = new Date();
    await store.orm.insert(sqliteSchema.preferences).values({
      id: "pref-1",
      operatorId: "operator-1",
      key: "theme",
      value: { mode: "dark" },
      updatedAt: now,
    });

    const rows = await store.orm.select().from(sqliteSchema.preferences);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe("theme");
    expect(rows[0]?.value).toEqual({ mode: "dark" });

    await expect(
      store.orm.insert(sqliteSchema.preferences).values({
        id: "pref-2",
        operatorId: "operator-1",
        key: "theme",
        value: { mode: "light" },
        updatedAt: now,
      }),
    ).rejects.toThrow();

    // A different operator may hold the same key: the index is composite.
    await store.orm.insert(sqliteSchema.preferences).values({
      id: "pref-3",
      operatorId: "operator-2",
      key: "theme",
      value: { mode: "light" },
      updatedAt: now,
    });
    expect(await store.orm.select().from(sqliteSchema.preferences)).toHaveLength(2);
  });

  it("creates the directory the database file lives in", async () => {
    const dir = tempDir();
    const file = join(dir, "nested", "deeper", "console.sqlite");
    const store = openSqliteStore(file);
    opened.push(store.driver);

    await store.migrate();
    expect((await store.status()).current).toBe(MIGRATIONS.at(-1)?.id);
  });

  it("refuses a file path it cannot create the directory for", () => {
    // The parent of the database file is a regular file, which is what a
    // mistyped CSAX_STORE_SQLITE_PATH usually looks like. The boot check turns
    // this into a readable message and a non-zero exit, verified by running the
    // built server; here the point is that opening throws rather than quietly
    // falling back to somewhere else.
    const blocker = join(tempDir(), "not-a-directory");
    writeFileSync(blocker, "");

    expect(() => openSqliteStore(join(blocker, "console.sqlite"))).toThrow();
  });
});

describe("placeholder translation", () => {
  it("numbers the neutral placeholders the way Postgres wants them", () => {
    expect(toNumberedPlaceholders("select * from t where a = ? and b = ?")).toBe(
      "select * from t where a = $1 and b = $2",
    );
    expect(toNumberedPlaceholders("select 1")).toBe("select 1");
  });

  it("does not count a question mark inside a string literal", () => {
    // Not supported, and deliberately so: every statement the console writes is
    // a plain query with no literal question marks. This test records the limit
    // rather than pretending the translation is a parser.
    expect(toNumberedPlaceholders("select '?' , a from t where b = ?")).toBe(
      "select '$1' , a from t where b = $2",
    );
  });
});

describe("migration list", () => {
  it("has unique, sortable ids and a statement list for both dialects", () => {
    const ids = MIGRATIONS.map((migration) => migration.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);

    for (const migration of MIGRATIONS) {
      expect(migration.statements.postgres.length).toBeGreaterThan(0);
      expect(migration.statements.sqlite.length).toBeGreaterThan(0);
    }
  });
});
