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

export const webauthnChallenges = sqliteTable(
  "webauthn_challenges",
  {
    id: text("id").primaryKey(),
    operatorId: text("operator_id").notNull(),
    kind: text("kind").notNull(),
    challenge: text("challenge").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("webauthn_challenges_operator_idx").on(table.operatorId),
    index("webauthn_challenges_expires_idx").on(table.expiresAt),
  ],
);

export const operatorPasskeys = sqliteTable(
  "operator_passkeys",
  {
    id: text("id").primaryKey(),
    operatorId: text("operator_id").notNull(),
    credentialId: text("credential_id").notNull().unique(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports", { mode: "json" }).notNull().default([]),
    deviceName: text("device_name").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("operator_passkeys_operator_idx").on(table.operatorId)],
);

export const stepUpGrants = sqliteTable(
  "step_up_grants",
  {
    id: text("id").primaryKey(),
    operatorId: text("operator_id").notNull(),
    sessionId: text("session_id").notNull(),
    purpose: text("purpose").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("step_up_grants_session_idx").on(table.sessionId),
    index("step_up_grants_expires_idx").on(table.expiresAt),
  ],
);

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
  webauthnChallenges,
  operatorPasskeys,
  stepUpGrants,
  vaultSecrets,
  consoleAudit,
  preferences,
};
