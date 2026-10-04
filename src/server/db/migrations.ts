/**
 * Schema migrations for the console store, as SQL, one statement list per
 * dialect. This file is the source of truth for the shape of the database:
 * `schema.postgres.ts` and `schema.sqlite.ts` exist so queries are typed, and
 * `tests/unit/db-store.test.ts` proves they agree with what these statements
 * actually create.
 *
 * Statements are ordered and each migration runs inside one transaction, so a
 * failure leaves the database at the previous migration rather than half way
 * through this one. Both engines support transactional DDL.
 *
 * Migrations are append-only. Correcting a statement that has shipped means a
 * new migration, never an edit to an applied one: a deployed console has
 * already run it and will not run it again.
 */

export type Dialect = "postgres" | "sqlite";

export type Migration = {
  /** Zero-padded so the natural sort is the apply order. Recorded in the database. */
  id: string;
  name: string;
  statements: Record<Dialect, readonly string[]>;
};

export const MIGRATIONS: readonly Migration[] = [
  {
    id: "0001",
    name: "console store tables",
    statements: {
      postgres: [
        `create table webauthn_challenges (
           id uuid primary key,
           operator_id text not null,
           kind text not null,
           challenge text not null,
           created_at timestamptz not null,
           expires_at timestamptz not null
         )`,
        `create index webauthn_challenges_operator_idx on webauthn_challenges (operator_id)`,
        `create index webauthn_challenges_expires_idx on webauthn_challenges (expires_at)`,

        `create table operator_passkeys (
           id uuid primary key,
           operator_id text not null,
           credential_id text not null unique,
           public_key text not null,
           counter integer not null default 0,
           transports jsonb not null default '[]'::jsonb,
           device_name text not null,
           backed_up boolean not null default false,
           created_at timestamptz not null,
           last_used_at timestamptz
         )`,
        `create index operator_passkeys_operator_idx on operator_passkeys (operator_id)`,

        `create table step_up_grants (
           id uuid primary key,
           operator_id text not null,
           session_id text not null,
           purpose text not null,
           created_at timestamptz not null,
           expires_at timestamptz not null,
           consumed_at timestamptz
         )`,
        `create index step_up_grants_session_idx on step_up_grants (session_id)`,
        `create index step_up_grants_expires_idx on step_up_grants (expires_at)`,

        `create table vault_secrets (
           id uuid primary key,
           name text not null unique,
           ciphertext text not null,
           nonce text not null,
           key_id text not null default 'v1',
           tags jsonb not null default '[]'::jsonb,
           created_at timestamptz not null,
           updated_at timestamptz not null,
           created_by text not null,
           updated_by text not null
         )`,
        `create index vault_secrets_updated_idx on vault_secrets (updated_at)`,

        `create table console_audit (
           id uuid primary key,
           at timestamptz not null,
           actor_id text not null,
           actor_label text not null,
           action text not null,
           target text,
           result text not null,
           detail jsonb,
           ip text
         )`,
        `create index console_audit_at_idx on console_audit (at)`,
        `create index console_audit_actor_idx on console_audit (actor_id)`,

        `create table preferences (
           id uuid primary key,
           operator_id text not null,
           key text not null,
           value jsonb not null,
           updated_at timestamptz not null
         )`,
        `create unique index preferences_operator_key_idx on preferences (operator_id, key)`,
      ],
      sqlite: [
        `create table webauthn_challenges (
           id text primary key not null,
           operator_id text not null,
           kind text not null,
           challenge text not null,
           created_at integer not null,
           expires_at integer not null
         )`,
        `create index webauthn_challenges_operator_idx on webauthn_challenges (operator_id)`,
        `create index webauthn_challenges_expires_idx on webauthn_challenges (expires_at)`,

        `create table operator_passkeys (
           id text primary key not null,
           operator_id text not null,
           credential_id text not null unique,
           public_key text not null,
           counter integer not null default 0,
           transports text not null default '[]',
           device_name text not null,
           backed_up integer not null default 0,
           created_at integer not null,
           last_used_at integer
         )`,
        `create index operator_passkeys_operator_idx on operator_passkeys (operator_id)`,

        `create table step_up_grants (
           id text primary key not null,
           operator_id text not null,
           session_id text not null,
           purpose text not null,
           created_at integer not null,
           expires_at integer not null,
           consumed_at integer
         )`,
        `create index step_up_grants_session_idx on step_up_grants (session_id)`,
        `create index step_up_grants_expires_idx on step_up_grants (expires_at)`,

        `create table vault_secrets (
           id text primary key not null,
           name text not null unique,
           ciphertext text not null,
           nonce text not null,
           key_id text not null default 'v1',
           tags text not null default '[]',
           created_at integer not null,
           updated_at integer not null,
           created_by text not null,
           updated_by text not null
         )`,
        `create index vault_secrets_updated_idx on vault_secrets (updated_at)`,

        `create table console_audit (
           id text primary key not null,
           at integer not null,
           actor_id text not null,
           actor_label text not null,
           action text not null,
           target text,
           result text not null,
           detail text,
           ip text
         )`,
        `create index console_audit_at_idx on console_audit (at)`,
        `create index console_audit_actor_idx on console_audit (actor_id)`,

        `create table preferences (
           id text primary key not null,
           operator_id text not null,
           key text not null,
           value text not null,
           updated_at integer not null
         )`,
        `create unique index preferences_operator_key_idx on preferences (operator_id, key)`,
      ],
    },
  },
];

/** The bookkeeping table the runner keeps for itself. Not one of the migrations. */
export const MIGRATIONS_TABLE = "console_migrations";

export function createMigrationsTableSql(dialect: Dialect): string {
  const appliedAt = dialect === "postgres" ? "timestamptz" : "integer";
  return `create table if not exists ${MIGRATIONS_TABLE} (
    id text primary key,
    name text not null,
    applied_at ${appliedAt} not null
  )`;
}
