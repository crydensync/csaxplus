import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { openPostgresStore } from "@/server/db/drivers";
import { MIGRATIONS, MIGRATIONS_TABLE } from "@/server/db/migrations";
import { consoleSchema as pgSchema } from "@/server/db/schema.postgres";
import { pgShape, type NeutralKind } from "@/server/db/shape";
import type { ConsoleStore } from "@/server/db/store";

/**
 * The Postgres half of the console store, executed against a real Postgres.
 *
 * PGlite is Postgres compiled to WebAssembly and `pglite-socket` serves it over
 * the wire protocol, so `openPostgresStore` below is the same function the
 * console calls at boot, reaching a real server over TCP with postgres-js. The
 * pool, the `?` to `$1` rewrite, the transaction handling, the DDL and the typed
 * drizzle handle are all the shipped code; nothing here is a stand-in for the
 * driver, which is the point. A parallel in-process driver would agree with
 * these tests and could still disagree with a deployment.
 *
 * PGlite runs every query on one backend and multiplexes the sockets onto it, so
 * the socket server has to allow at least the pool size `openPostgresStore`
 * asks for or the second connection is refused.
 */

/** Above the `max: 5` pool in `openPostgresStore`, with room for a closed pool to drain. */
const SOCKET_CONNECTIONS = 10;

let db: PGlite;
let server: PGLiteSocketServer;
let url: string;

const opened: ConsoleStore[] = [];

beforeAll(async () => {
  db = new PGlite();
  server = new PGLiteSocketServer({
    db,
    // 0 asks the OS for a free port, so the suite cannot collide with a real
    // Postgres or with a second run of itself.
    port: 0,
    host: "127.0.0.1",
    maxConnections: SOCKET_CONNECTIONS,
  });
  await server.start();

  // `getServerConn` answers `host:port`, and the port is only known once the
  // server is listening, which is why the URL is built after `start`.
  url = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
}, 120_000);

afterAll(async () => {
  await server.stop();
  await db.close();
}, 60_000);

beforeEach(async () => {
  // A fresh database per test without paying for a new WebAssembly instance:
  // `public` is the only schema these migrations touch.
  await db.exec("drop schema if exists public cascade; create schema public;");
}, 60_000);

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.close();
});

function freshStore(): ConsoleStore {
  const store = openPostgresStore(url);
  opened.push(store);
  return store;
}

async function tableNames(store: ConsoleStore): Promise<string[]> {
  const rows = await store.driver.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  );
  return rows.map((row) => row.table_name);
}

describe("migration runner on Postgres", () => {
  it("creates every table on a fresh database and records what it applied", async () => {
    const store = freshStore();
    expect(store.dialect).toBe("postgres");

    const result = await store.migrate();

    expect(result.applied.map((migration) => migration.id)).toEqual(
      MIGRATIONS.map((migration) => migration.id),
    );
    expect(result.skipped).toBe(0);

    const names = await tableNames(store);
    for (const table of Object.values(pgShape())) {
      expect(names, table.name).toContain(table.name);
    }
    expect(names).toContain(MIGRATIONS_TABLE);
  }, 60_000);

  it("does nothing on a second run", async () => {
    const store = freshStore();
    await store.migrate();

    const second = await store.migrate();
    expect(second.applied).toEqual([]);
    expect(second.skipped).toBe(MIGRATIONS.length);

    const status = await store.status();
    expect(status.pending).toEqual([]);
    expect(status.current).toBe(MIGRATIONS.at(-1)?.id);
  }, 60_000);

  it("reports what is outstanding without applying it", async () => {
    const store = freshStore();

    const status = await store.status();
    expect(status.applied).toEqual([]);
    expect(status.current).toBeNull();
    expect(status.pending.map((migration) => migration.id)).toEqual(
      MIGRATIONS.map((migration) => migration.id),
    );

    // Asking must not have created anything beyond its own bookkeeping table.
    expect(await tableNames(store)).toEqual([MIGRATIONS_TABLE]);
  }, 60_000);

  it("leaves nothing behind when a migration fails part way through", async () => {
    const store = freshStore();
    const driver = store.driver;

    await expect(
      driver.runAtomically([
        { sql: "create table partially_applied (id uuid primary key)" },
        { sql: "this is not sql" },
      ]),
    ).rejects.toThrow();

    expect(await tableNames(store)).not.toContain("partially_applied");
  }, 60_000);
});

/**
 * The Postgres type names Postgres itself reports, mapped onto the neutral
 * kinds. `pgShape()` knows the drizzle type names (`PgUUID`, `PgTimestamp`); the
 * database answers with SQL type names, and this is where the two meet.
 */
const KIND_BY_DATA_TYPE: Record<string, NeutralKind> = {
  uuid: "text",
  text: "text",
  integer: "integer",
  boolean: "boolean",
  "timestamp with time zone": "timestamp",
  jsonb: "json",
};

type DatabaseColumn = {
  name: string;
  kind: NeutralKind;
  notNull: boolean;
  primaryKey: boolean;
  hasDefault: boolean;
};

type DatabaseTable = {
  name: string;
  columns: DatabaseColumn[];
  uniqueSets: string[][];
};

/** What the database says a table looks like, read from the system catalogs. */
async function readTable(store: ConsoleStore, table: string): Promise<DatabaseTable> {
  const columns = await store.driver.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = ?
      order by ordinal_position`,
    [table],
  );

  const keyed = await store.driver.query<{ column_name: string }>(
    `select a.attname as column_name
       from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ?::regclass and i.indisprimary`,
    [table],
  );
  const primary = new Set(keyed.map((row) => row.column_name));

  // Every unique set that is not the primary key. A column-level `.unique()` and
  // a composite `uniqueIndex` both arrive here as a unique index, which is why
  // the comparison is between sets rather than between declarations.
  const unique = await store.driver.query<{ columns: string[] }>(
    `select array_agg(a.attname::text order by a.attname::text) as columns
       from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = ?::regclass and i.indisunique and not i.indisprimary
      group by i.indexrelid`,
    [table],
  );

  return {
    name: table,
    columns: columns.map((column) => {
      const kind = KIND_BY_DATA_TYPE[column.data_type];
      if (kind === undefined) {
        // A column type with no neutral kind would otherwise drop out of the
        // comparison silently, which is the one failure this test exists for.
        throw new Error(`no neutral kind for the Postgres type ${column.data_type}`);
      }
      return {
        name: column.column_name,
        kind,
        notNull: column.is_nullable === "NO",
        primaryKey: primary.has(column.column_name),
        hasDefault: column.column_default !== null,
      };
    }),
    uniqueSets: unique
      .map((row) => [...row.columns].sort())
      .sort((left, right) => left.join(",").localeCompare(right.join(","))),
  };
}

describe("the schema the migrations create on Postgres", () => {
  it("is the schema the typed table definitions describe", async () => {
    const store = freshStore();
    await store.migrate();

    for (const [key, expected] of Object.entries(pgShape())) {
      const actual = await readTable(store, expected.name);

      expect(actual.columns, `${key}: ${expected.name} columns`).toEqual(
        expected.columns.map(({ name, kind, notNull, primaryKey, hasDefault }) => ({
          name,
          kind,
          notNull,
          primaryKey,
          hasDefault,
        })),
      );

      expect(actual.uniqueSets, `${key}: unique sets`).toEqual(expected.uniqueSets);
    }
  }, 60_000);

  it("declares no table the typed definitions do not know about", async () => {
    const store = freshStore();
    await store.migrate();

    const declared = Object.values(pgShape()).map((table) => table.name);
    expect(await tableNames(store)).toEqual([...declared, MIGRATIONS_TABLE].sort());
  }, 60_000);
});

describe("the store through the typed handle on Postgres", () => {
  it("round-trips a row and refuses a duplicate where the schema says unique", async () => {
    const store = freshStore();
    await store.migrate();
    if (store.dialect !== "postgres") throw new Error("expected the Postgres store");

    const now = new Date();
    const operator = "3f2a1c88-0000-4000-8000-0000000000a1";
    const other = "7c9d4e21-0000-4000-8000-0000000000b2";

    await store.orm.insert(pgSchema.preferences).values({
      id: "11111111-1111-4111-8111-111111111111",
      operatorId: operator,
      key: "theme",
      value: { mode: "dark" },
      updatedAt: now,
    });

    const rows = await store.orm.select().from(pgSchema.preferences);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe("theme");
    expect(rows[0]?.value).toEqual({ mode: "dark" });

    await expect(
      store.orm.insert(pgSchema.preferences).values({
        id: "22222222-2222-4222-8222-222222222222",
        operatorId: operator,
        key: "theme",
        value: { mode: "light" },
        updatedAt: now,
      }),
    ).rejects.toThrow();

    // A different operator may hold the same key: the index is composite.
    await store.orm.insert(pgSchema.preferences).values({
      id: "33333333-3333-4333-8333-333333333333",
      operatorId: other,
      key: "theme",
      value: { mode: "light" },
      updatedAt: now,
    });
    expect(await store.orm.select().from(pgSchema.preferences)).toHaveLength(2);
  }, 60_000);

  it("stores a timestamp as an instant, not as a number", async () => {
    // SQLite keeps the millisecond count; Postgres keeps a timestamptz. Both are
    // read back as a Date, which is the promise the neutral driver makes.
    const store = freshStore();
    await store.migrate();
    if (store.dialect !== "postgres") throw new Error("expected the Postgres store");

    const at = new Date("2026-10-04T09:30:00.000Z");
    await store.orm.insert(pgSchema.webauthnChallenges).values({
      id: "44444444-4444-4444-8444-444444444444",
      operatorId: "operator-1",
      kind: "step-up",
      challenge: "not-a-real-challenge",
      createdAt: at,
      expiresAt: at,
    });

    const rows = await store.orm.select().from(pgSchema.webauthnChallenges);
    expect(rows[0]?.createdAt).toBeInstanceOf(Date);
    expect((rows[0]?.createdAt as Date).toISOString()).toBe("2026-10-04T09:30:00.000Z");
  }, 60_000);
});
