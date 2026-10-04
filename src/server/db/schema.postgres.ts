import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The console's own store, Postgres dialect. It holds only what the engine does
 * not: console-owned step-up passkeys, short-lived step-up grants, the encrypted
 * secret vault, console audit entries and per-operator preferences. Operator
 * identity itself lives in the engine and is reached over the API.
 *
 * `schema.sqlite.ts` is the same schema for SQLite. The two files are written
 * out rather than generated from one specification, because the differences
 * (uuid/text, timestamptz/integer, boolean/integer, jsonb/text) are exactly the
 * ones a reader wants to see spelled out. `shape.ts` projects both dialects onto
 * one neutral description and `tests/unit/db-schema.test.ts` fails if they drift.
 */

export const webauthnChallenges = pgTable(
  "webauthn_challenges",
  {
    id: uuid("id").primaryKey(),
    operatorId: text("operator_id").notNull(),
    kind: text("kind").notNull(),
    challenge: text("challenge").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("webauthn_challenges_operator_idx").on(table.operatorId),
    index("webauthn_challenges_expires_idx").on(table.expiresAt),
  ],
);

export const operatorPasskeys = pgTable(
  "operator_passkeys",
  {
    id: uuid("id").primaryKey(),
    operatorId: text("operator_id").notNull(),
    credentialId: text("credential_id").notNull().unique(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: jsonb("transports").notNull().default([]),
    deviceName: text("device_name").notNull(),
    backedUp: boolean("backed_up").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [index("operator_passkeys_operator_idx").on(table.operatorId)],
);

export const stepUpGrants = pgTable(
  "step_up_grants",
  {
    id: uuid("id").primaryKey(),
    operatorId: text("operator_id").notNull(),
    sessionId: text("session_id").notNull(),
    purpose: text("purpose").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    index("step_up_grants_session_idx").on(table.sessionId),
    index("step_up_grants_expires_idx").on(table.expiresAt),
  ],
);

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
  webauthnChallenges,
  operatorPasskeys,
  stepUpGrants,
  vaultSecrets,
  consoleAudit,
  preferences,
};
