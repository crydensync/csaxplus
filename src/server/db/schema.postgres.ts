import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * The console's own store, Postgres dialect. It holds only what the engine does
 * not: the encrypted secret vault, console audit entries and per-operator
 * preferences. Operator identity itself lives in the engine and is reached over
 * the API, and so do the operator's passkeys: those are the account's credentials
 * at the API rather than this console's, so nothing here stores one.
 *
 * `schema.sqlite.ts` is the same schema for SQLite. The two files are written
 * out rather than generated from one specification, because the differences
 * (uuid/text, timestamptz/integer, boolean/integer, jsonb/text) are exactly the
 * ones a reader wants to see spelled out. `shape.ts` projects both dialects onto
 * one neutral description and `tests/unit/db-store.test.ts` fails if they drift.
 */

export const vaultSecrets = pgTable(
  "vault_secrets",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull().unique(),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    keyId: text("key_id").notNull().default("v1"),
    tags: jsonb("tags").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (table) => [index("vault_secrets_updated_idx").on(table.updatedAt)],
);

export const consoleAudit = pgTable(
  "console_audit",
  {
    id: uuid("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    actorId: text("actor_id").notNull(),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    result: text("result").notNull(),
    detail: jsonb("detail"),
    ip: text("ip"),
  },
  (table) => [
    index("console_audit_at_idx").on(table.at),
    index("console_audit_actor_idx").on(table.actorId),
  ],
);

export const preferences = pgTable(
  "preferences",
  {
    id: uuid("id").primaryKey(),
    operatorId: text("operator_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("preferences_operator_key_idx").on(table.operatorId, table.key)],
);

export const consoleSchema = {
  vaultSecrets,
  consoleAudit,
  preferences,
};
