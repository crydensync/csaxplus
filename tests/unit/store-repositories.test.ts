import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { openPostgresStore, openSqliteStore } from "@/server/db/drivers";
import type { ConsoleStore } from "@/server/db/store";
import {
  CHALLENGE_TTL_MS,
  pruneChallenges,
  saveChallenge,
  takeChallenge,
} from "@/server/store/challenges";
import {
  GRANT_TTL_MS,
  consumeGrant,
  isStepUpPurpose,
  issueGrant,
  pruneGrants,
} from "@/server/store/grants";
import {
  countPasskeys,
  deletePasskey,
  findPasskeyByCredentialId,
  insertPasskey,
  listPasskeys,
  recordPasskeyUse,
} from "@/server/store/passkeys";
import { newId } from "@/server/store/support";

/**
 * The console store's repositories, run against both engines.
 *
 * This is the first code to read or write the console store, so it is also where
 * the two dialects are held to the same behaviour: every statement here is
 * written once and has to give the same answers on a real SQLite file and a real
 * Postgres over the wire protocol. Where the engines genuinely differ, the
 * difference is one `support.ts` conversion rather than a branch in a repository,
 * and `column values` below is what says so.
 *
 * PGlite is Postgres compiled to WebAssembly, served by `pglite-socket`, so the
 * driver under test is the shipped `openPostgresStore`. `db-postgres.test.ts`
 * explains the arrangement in full.
 *
 * Times are passed in rather than read from the clock, so a TTL can be tested by
 * handing over the moment after it elapsed.
 */

const SOCKET_CONNECTIONS = 10;

let db: PGlite;
let server: PGLiteSocketServer;
let url: string;

const opened: ConsoleStore[] = [];
const dirs: string[] = [];

beforeAll(async () => {
  db = new PGlite();
  server = new PGLiteSocketServer({
    db,
    port: 0,
    host: "127.0.0.1",
    maxConnections: SOCKET_CONNECTIONS,
  });
  await server.start();
  url = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
}, 120_000);

afterAll(async () => {
  await server.stop();
  await db.close();
}, 60_000);

afterEach(async () => {
  while (opened.length > 0) await opened.pop()?.close();
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

async function freshSqlite(): Promise<ConsoleStore> {
  const dir = mkdtempSync(join(tmpdir(), "csax-repo-"));
  dirs.push(dir);
  const store = openSqliteStore(join(dir, "console.sqlite"));
  opened.push(store);
  return store;
}

async function freshPostgres(): Promise<ConsoleStore> {
  await db.exec("drop schema if exists public cascade; create schema public;");
  const store = openPostgresStore(url);
  opened.push(store);
  return store;
}

const AT = new Date("2026-10-07T12:00:00.000Z");

function atOffset(ms: number): Date {
  return new Date(AT.getTime() + ms);
}

/** A public key with bytes that would not survive a UTF-8 round trip. */
const PUBLIC_KEY = new Uint8Array([0x00, 0xa5, 0xff, 0x10, 0x80, 0x7f, 0x00, 0xfe]);

async function register(
  store: ConsoleStore,
  operatorId: string,
  credentialId: string,
  at: Date = AT,
): Promise<string> {
  const passkey = await insertPasskey(store.driver, {
    operatorId,
    credentialId,
    publicKey: PUBLIC_KEY,
    counter: 0,
    transports: ["internal", "hybrid"],
    deviceName: "Work laptop",
    backedUp: false,
    at,
  });
  return passkey.id;
}

for (const engine of [
  { name: "SQLite", fresh: freshSqlite },
  { name: "Postgres", fresh: freshPostgres },
]) {
  describe(`the console store on ${engine.name}`, () => {
    async function migrated(): Promise<ConsoleStore> {
      const store = await engine.fresh();
      await store.migrate();
      return store;
    }

    describe("column values", () => {
      it("round-trips an instant, a boolean and JSON through a real table", async () => {
        const store = await migrated();
        // A row's id is `uuid` on Postgres and `text` on SQLite, so the only id
        // valid on both is the one `newId` generates. A friendly string like
        // "pk-1" is a real defect on Postgres and perfectly fine on SQLite,
        // which is why this reads as a supported operation rather than a check.
        const id = newId();

        await store.driver.execute(
          `insert into operator_passkeys
             (id, operator_id, credential_id, public_key, counter, transports,
              device_name, backed_up, created_at, last_used_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            "operator-1",
            "cred-1",
            "public-key-1",
            7,
            JSON.stringify(["internal", "hybrid"]),
            "Laptop",
            store.dialect === "postgres" ? true : 1,
            store.dialect === "postgres" ? AT : AT.getTime(),
            null,
          ],
        );

        const rows = await store.driver.query<Record<string, unknown>>(
          `select * from operator_passkeys where id = ?`,
          [id],
        );
        expect(rows).toHaveLength(1);
        const row = rows[0] as Record<string, unknown>;

        // Whatever the engine hands back, the repository reads a Date, a boolean
        // and a string array out of it. These are the three conversions the rest
        // of this file depends on, and each differs by dialect: SQLite stores
        // JSON as the text it wrote, Postgres answers with it already parsed.
        expect(new Date(row.created_at as string | number).toISOString()).toBe(AT.toISOString());
        expect(row.last_used_at).toBeNull();
        const transports =
          typeof row.transports === "string" ? JSON.parse(row.transports) : row.transports;
        expect(transports).toEqual(["internal", "hybrid"]);
        expect(Number(row.counter)).toBe(7);
      });

      it("deletes and returns a row in one statement", async () => {
        const store = await migrated();
        await saveChallenge(store.driver, {
          operatorId: "operator-1",
          kind: "passkey.step-up",
          challenge: "the-challenge",
          at: AT,
        });

        // `delete ... returning` is how a challenge is spent, so both engines
        // have to support it. SQLite has since 3.35, which is what
        // better-sqlite3 carries.
        const taken = await store.driver.query<{ id: string }>(
          `delete from webauthn_challenges where operator_id = ? returning id`,
          ["operator-1"],
        );
        expect(taken).toHaveLength(1);

        const again = await store.driver.query<{ id: string }>(
          `delete from webauthn_challenges where operator_id = ? returning id`,
          ["operator-1"],
        );
        expect(again).toEqual([]);
      });
    });

    describe("passkeys", () => {
      it("stores a passkey and reads back every field", async () => {
        const store = await migrated();
        await register(store, "operator-1", "cred-1");

        const passkeys = await listPasskeys(store.driver, "operator-1");
        expect(passkeys).toHaveLength(1);
        const passkey = passkeys[0]!;

        expect(passkey.operatorId).toBe("operator-1");
        expect(passkey.credentialId).toBe("cred-1");
        // Bytes that are not valid UTF-8, so an encoding that lost them shows up.
        expect(Array.from(passkey.publicKey)).toEqual(Array.from(PUBLIC_KEY));
        expect(passkey.transports).toEqual(["internal", "hybrid"]);
        expect(passkey.deviceName).toBe("Work laptop");
        expect(passkey.backedUp).toBe(false);
        expect(passkey.counter).toBe(0);
        expect(passkey.createdAt.toISOString()).toBe(AT.toISOString());
        expect(passkey.lastUsedAt).toBeNull();
      });

      it("keeps one operator's passkeys out of another's list", async () => {
        const store = await migrated();
        await register(store, "operator-1", "cred-1");
        await register(store, "operator-2", "cred-2");

        const mine = await listPasskeys(store.driver, "operator-1");
        expect(mine.map((passkey) => passkey.credentialId)).toEqual(["cred-1"]);
        expect(await countPasskeys(store.driver, "operator-1")).toBe(1);
        expect(await countPasskeys(store.driver, "operator-2")).toBe(1);
      });

      it("lists oldest first, so a new passkey appears at the end", async () => {
        const store = await migrated();
        await register(store, "operator-1", "first", AT);
        await register(store, "operator-1", "second", atOffset(1_000));

        const passkeys = await listPasskeys(store.driver, "operator-1");
        expect(passkeys.map((passkey) => passkey.credentialId)).toEqual(["first", "second"]);
      });

      it("gives the same order every time, even for two registered in one millisecond", async () => {
        const store = await migrated();
        // The timestamp is the same for both, so the order rests on the id
        // tie-break. That order is arbitrary but it must not change between
        // reads, or a list would reshuffle itself under the operator.
        await register(store, "operator-1", "first", AT);
        await register(store, "operator-1", "second", AT);

        const once = await listPasskeys(store.driver, "operator-1");
        const twice = await listPasskeys(store.driver, "operator-1");
        expect(twice.map((passkey) => passkey.credentialId)).toEqual(
          once.map((passkey) => passkey.credentialId),
        );
        expect([...once.map((passkey) => passkey.credentialId)].sort()).toEqual([
          "first",
          "second",
        ]);
      });

      it("finds a credential by id whichever operator holds it", async () => {
        const store = await migrated();
        await register(store, "operator-1", "cred-1");
        await register(store, "operator-2", "cred-2");

        // The credential id arrives from the authenticator before the console
        // knows whose it is, so this lookup cannot be scoped to an operator.
        const found = await findPasskeyByCredentialId(store.driver, "cred-2");
        expect(found?.operatorId).toBe("operator-2");
        expect(await findPasskeyByCredentialId(store.driver, "nobody")).toBeNull();
      });

      it("refuses a second passkey with the same credential id", async () => {
        const store = await migrated();
        await register(store, "operator-1", "cred-1");

        // The unique index is the real guard against one authenticator being
        // enrolled twice, which would otherwise leave two rows for one counter.
        await expect(register(store, "operator-2", "cred-1")).rejects.toThrow();
      });

      it("removes a passkey when the operator holds more than one", async () => {
        const store = await migrated();
        const first = await register(store, "operator-1", "cred-1");
        await register(store, "operator-1", "cred-2");

        expect(await deletePasskey(store.driver, "operator-1", first)).toBe(true);
        const left = await listPasskeys(store.driver, "operator-1");
        expect(left.map((passkey) => passkey.credentialId)).toEqual(["cred-2"]);
      });

      it("refuses to remove the last passkey", async () => {
        const store = await migrated();
        const only = await register(store, "operator-1", "cred-1");

        // An operator with no passkey cannot step up, and every operation that
        // needs one would be permanently out of reach.
        expect(await deletePasskey(store.driver, "operator-1", only)).toBe(false);
        expect(await countPasskeys(store.driver, "operator-1")).toBe(1);
      });

      it("refuses to remove a passkey belonging to someone else", async () => {
        const store = await migrated();
        await register(store, "operator-1", "cred-1");
        const theirs = await register(store, "operator-2", "cred-2");
        await register(store, "operator-2", "cred-3");

        expect(await deletePasskey(store.driver, "operator-1", theirs)).toBe(false);
        expect(await countPasskeys(store.driver, "operator-2")).toBe(2);
      });

      it("records the counter and the time a credential was last used", async () => {
        const store = await migrated();
        const id = await register(store, "operator-1", "cred-1");

        await recordPasskeyUse(store.driver, id, 5, atOffset(60_000));

        const passkey = (await listPasskeys(store.driver, "operator-1"))[0]!;
        expect(passkey.counter).toBe(5);
        expect(passkey.lastUsedAt?.toISOString()).toBe(atOffset(60_000).toISOString());
      });
    });

    describe("challenges", () => {
      it("answers with a challenge once and not twice", async () => {
        const store = await migrated();
        const id = await saveChallenge(store.driver, {
          operatorId: "operator-1",
          kind: "passkey.register",
          challenge: "the-challenge",
          at: AT,
        });

        const taken = await takeChallenge(store.driver, {
          id,
          operatorId: "operator-1",
          now: AT,
        });
        expect(taken).toEqual({ kind: "passkey.register", challenge: "the-challenge" });

        // Spending it is what makes a captured answer unreplayable.
        const again = await takeChallenge(store.driver, { id, operatorId: "operator-1", now: AT });
        expect(again).toBeNull();
      });

      it("will not hand an operator someone else's challenge", async () => {
        const store = await migrated();
        const id = await saveChallenge(store.driver, {
          operatorId: "operator-1",
          kind: "passkey.step-up",
          challenge: "the-challenge",
          at: AT,
        });

        const stolen = await takeChallenge(store.driver, {
          id,
          operatorId: "operator-2",
          now: AT,
        });
        expect(stolen).toBeNull();

        // The refusal is not a read: the row is still the rightful operator's.
        const mine = await takeChallenge(store.driver, { id, operatorId: "operator-1", now: AT });
        expect(mine).not.toBeNull();
      });

      it("refuses a challenge that has expired, and clears it away", async () => {
        const store = await migrated();
        const id = await saveChallenge(store.driver, {
          operatorId: "operator-1",
          kind: "passkey.step-up",
          challenge: "the-challenge",
          at: AT,
        });

        const late = await takeChallenge(store.driver, {
          id,
          operatorId: "operator-1",
          now: atOffset(CHALLENGE_TTL_MS + 1),
        });
        expect(late).toBeNull();

        // Still spent: an expired challenge is gone, not merely refused.
        const rows = await store.driver.query<{ id: string }>(
          `select id from webauthn_challenges where id = ?`,
          [id],
        );
        expect(rows).toEqual([]);
      });

      it("sweeps expired challenges aside when a new one is saved", async () => {
        const store = await migrated();
        await saveChallenge(store.driver, {
          operatorId: "operator-1",
          kind: "passkey.step-up",
          challenge: "stale",
          at: AT,
        });

        await saveChallenge(store.driver, {
          operatorId: "operator-1",
          kind: "passkey.step-up",
          challenge: "fresh",
          at: atOffset(CHALLENGE_TTL_MS + 1),
        });

        const rows = await store.driver.query<{ challenge: string }>(
          `select challenge from webauthn_challenges order by created_at`,
          [],
        );
        expect(rows.map((row) => row.challenge)).toEqual(["fresh"]);
      });

      it("prunes only what has expired", async () => {
        const store = await migrated();
        await saveChallenge(store.driver, {
          operatorId: "operator-1",
          kind: "passkey.step-up",
          challenge: "old",
          at: AT,
        });
        await saveChallenge(store.driver, {
          operatorId: "operator-1",
          kind: "passkey.step-up",
          challenge: "new",
          at: atOffset(CHALLENGE_TTL_MS),
        });

        await pruneChallenges(store.driver, atOffset(CHALLENGE_TTL_MS + 1));

        const rows = await store.driver.query<{ challenge: string }>(
          `select challenge from webauthn_challenges`,
          [],
        );
        expect(rows.map((row) => row.challenge)).toEqual(["new"]);
      });
    });

    describe("step-up grants", () => {
      async function grant(
        store: ConsoleStore,
        overrides: Partial<{
          operatorId: string;
          sessionId: string;
          purpose: "passkey.register" | "passkey.remove";
        }> = {},
      ): Promise<string> {
        return issueGrant(store.driver, {
          operatorId: "operator-1",
          sessionId: "session-1",
          purpose: "passkey.remove",
          at: AT,
          ...overrides,
        });
      }

      it("spends a grant once and not twice", async () => {
        const store = await migrated();
        const id = await grant(store);

        const first = await consumeGrant(store.driver, {
          id,
          operatorId: "operator-1",
          sessionId: "session-1",
          purpose: "passkey.remove",
          now: AT,
        });
        expect(first).toBe(true);

        // The conditional update is what makes this true for two simultaneous
        // requests: the first to reach the row takes it, the second matches none.
        const second = await consumeGrant(store.driver, {
          id,
          operatorId: "operator-1",
          sessionId: "session-1",
          purpose: "passkey.remove",
          now: AT,
        });
        expect(second).toBe(false);
      });

      it("will not spend a grant for a different purpose", async () => {
        const store = await migrated();
        const id = await grant(store, { purpose: "passkey.remove" });

        // A grant to remove a passkey is not a grant to register one, or the
        // narrower permission would quietly carry the wider one with it.
        const wrong = await consumeGrant(store.driver, {
          id,
          operatorId: "operator-1",
          sessionId: "session-1",
          purpose: "passkey.register",
          now: AT,
        });
        expect(wrong).toBe(false);
      });

      it("will not spend a grant in a different session", async () => {
        const store = await migrated();
        const id = await grant(store, { sessionId: "session-1" });

        const elsewhere = await consumeGrant(store.driver, {
          id,
          operatorId: "operator-1",
          sessionId: "session-2",
          purpose: "passkey.remove",
          now: AT,
        });
        expect(elsewhere).toBe(false);

        // And the refusal did not spend it: it is still the first session's.
        const mine = await consumeGrant(store.driver, {
          id,
          operatorId: "operator-1",
          sessionId: "session-1",
          purpose: "passkey.remove",
          now: AT,
        });
        expect(mine).toBe(true);
      });

      it("will not spend another operator's grant", async () => {
        const store = await migrated();
        const id = await grant(store, { operatorId: "operator-1" });

        const stolen = await consumeGrant(store.driver, {
          id,
          operatorId: "operator-2",
          sessionId: "session-1",
          purpose: "passkey.remove",
          now: AT,
        });
        expect(stolen).toBe(false);
      });

      it("will not spend a grant that has expired", async () => {
        const store = await migrated();
        const id = await grant(store);

        const late = await consumeGrant(store.driver, {
          id,
          operatorId: "operator-1",
          sessionId: "session-1",
          purpose: "passkey.remove",
          now: atOffset(GRANT_TTL_MS + 1),
        });
        expect(late).toBe(false);
      });

      it("sweeps spent grants aside when a new one is issued", async () => {
        const store = await migrated();
        const spent = await grant(store);
        await consumeGrant(store.driver, {
          id: spent,
          operatorId: "operator-1",
          sessionId: "session-1",
          purpose: "passkey.remove",
          now: AT,
        });

        const fresh = await grant(store);

        const rows = await store.driver.query<{ id: string }>(
          `select id from step_up_grants`,
          [],
        );
        expect(rows.map((row) => row.id)).toEqual([fresh]);
      });

      it("prunes expired grants and leaves live ones", async () => {
        const store = await migrated();
        await grant(store);

        // Half the TTL in, nothing has expired, so a sweep takes nothing.
        await pruneGrants(store.driver, atOffset(GRANT_TTL_MS / 2));
        const kept = await store.driver.query<{ id: string }>(`select id from step_up_grants`, []);
        expect(kept).toHaveLength(1);

        await pruneGrants(store.driver, atOffset(GRANT_TTL_MS + 1));
        const swept = await store.driver.query<{ id: string }>(`select id from step_up_grants`, []);
        expect(swept).toEqual([]);
      });

      it("knows which purposes exist", () => {
        expect(isStepUpPurpose("passkey.remove")).toBe(true);
        expect(isStepUpPurpose("passkey.register")).toBe(true);
        // A purpose is a thing this console knows how to do. Anything else
        // would be a grant that could never be spent.
        expect(isStepUpPurpose("vault.read")).toBe(false);
        expect(isStepUpPurpose("")).toBe(false);
      });
    });
  });
}
