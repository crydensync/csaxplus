import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * The console's own store, SQLite dialect. Structurally the same schema as
 * `schema.postgres.ts`, which documents what each table is for.
 *
 * SQLite has no uuid, timestamptz, boolean or jsonb column types, so the
 * neutral kinds map down: uuid to text, timestamptz to integer holding unix
 * milliseconds, boolean to integer holding 0 or 1, and jsonb to text holding
 * serialised JSON. `shape.ts` maps both dialects back to the neutral kind, so
 * the drift test compares what the columns mean rather than how they are spelt.
 */

export const vaultSecrets = sqliteTable(
  "vault_secrets",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    keyId: text("key_id").notNull().default("v1"),
    tags: text("tags", { mode: "json" }).notNull().default([]),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
  },
  (table) => [index("vault_secrets_updated_idx").on(table.updatedAt)],
);

export const consoleAudit = sqliteTable(
  "console_audit",
  {
    id: text("id").primaryKey(),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
    actorId: text("actor_id").notNull(),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    result: text("result").notNull(),
    detail: text("detail", { mode: "json" }),
    ip: text("ip"),
  },
  (table) => [
    index("console_audit_at_idx").on(table.at),
    index("console_audit_actor_idx").on(table.actorId),
  ],
);

export const preferences = sqliteTable(
  "preferences",
  {
    id: text("id").primaryKey(),
    operatorId: text("operator_id").notNull(),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("preferences_operator_key_idx").on(table.operatorId, table.key)],
);

export const consoleSchema = {
  vaultSecrets,
  consoleAudit,
  preferences,
};
