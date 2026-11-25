import "server-only";

import { randomUUID } from "node:crypto";

import type { ConsoleStore } from "@/server/db/store";
import { getConfig } from "@/server/config";
import { fsApi, pathApi } from "@/server/node/builtins";
import { decryptVaultValue, encryptVaultValue, vaultKeyID } from "./crypto.mjs";

export { decryptVaultValue, encryptVaultValue, vaultKeyID } from "./crypto.mjs";

export type SecretSource = "environment" | "file" | "vault";
export type SecretDescriptor = {
  name: string;
  source: SecretSource;
  tags: string[];
  updated_at: string | null;
  masked: string;
};
export type SecretActor = { id: string; label: string };
export class SecretVaultError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SecretVaultError";
  }
}

type VaultRow = {
  id: string;
  name: string;
  ciphertext: string;
  nonce: string;
  key_id: string;
  tags: string[] | string;
  created_at: string | Date | number;
  updated_at: string | Date | number;
  created_by: string;
  updated_by: string;
};

type ExternalEntry = { name: string; source: "environment" | "file"; path?: string };
const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const SECRET_SUFFIX = /(?:API_KEY|ACCESS_KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIALS?|DSN|DATABASE_URL|STORE_URL|PRIVATE_KEY)$/i;
const NEVER_EXPOSE = new Set(["CSAX_SESSION_SECRET", "CSAX_VAULT_KEY"]);

function isManagedSecretName(name: string): boolean {
  return SECRET_NAME.test(name) && SECRET_SUFFIX.test(name) && !NEVER_EXPOSE.has(name);
}

function externalEntries(): ExternalEntry[] {
  const entries = new Map<string, ExternalEntry>();
  for (const [name, value] of Object.entries(process.env)) {
    if (!isManagedSecretName(name) || name.endsWith("_FILE")) continue;
    if (value?.trim()) entries.set(name, { name, source: "environment" });
  }
  for (const [key, path] of Object.entries(process.env)) {
    if (!key.endsWith("_FILE") || !path?.trim()) continue;
    const name = key.slice(0, -5);
    if (isManagedSecretName(name) && !entries.has(name)) {
      entries.set(name, { name, source: "file", path });
    }
  }

  const secretsDir = "/run/secrets";
  try {
    if (fsApi().existsSync(secretsDir)) {
      for (const name of fsApi().readdirSync(secretsDir)) {
        if (isManagedSecretName(name) && !entries.has(name)) {
          entries.set(name, { name, source: "file", path: pathApi().join(secretsDir, name) });
        }
      }
    }
  } catch {
    // An absent or unreadable optional mount does not make the vault unavailable.
  }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function parseTags(value: string[] | string): string[] {
  if (Array.isArray(value)) return value.filter((tag) => typeof tag === "string");
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function iso(value: string | Date | number): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function timeParam(store: ConsoleStore, value: Date): Date | number {
  return store.dialect === "sqlite" ? value.getTime() : value;
}

function currentKey(): Buffer {
  return Buffer.from(getConfig().vault.key);
}

export async function listSecrets(store: ConsoleStore): Promise<SecretDescriptor[]> {
  const rows = await store.driver.query<VaultRow>(
    "select id, name, ciphertext, nonce, key_id, tags, created_at, updated_at, created_by, updated_by from vault_secrets order by name",
  );
  const vault = rows.map((row) => ({
    name: row.name,
    source: "vault" as const,
    tags: parseTags(row.tags),
    updated_at: iso(row.updated_at),
    masked: "••••••••",
  }));
  const external = externalEntries().map((entry) => ({
    name: entry.name,
    source: entry.source,
    tags: [] as string[],
    updated_at: null,
    masked: "••••••••",
  }));
  return [...vault, ...external].sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
}

export async function revealSecret(
  store: ConsoleStore,
  name: string,
  source: SecretSource,
): Promise<string> {
  if (!SECRET_NAME.test(name)) throw new SecretVaultError(400, "invalid_secret_name", "That secret name is invalid.");
  if (source === "vault") {
    const rows = await store.driver.query<VaultRow>(
      "select id, name, ciphertext, nonce, key_id, tags, created_at, updated_at, created_by, updated_by from vault_secrets where name = ?",
      [name],
    );
    if (!rows[0]) throw new SecretVaultError(404, "secret_not_found", "That secret no longer exists.");
    try {
      return decryptVaultValue(rows[0].name, rows[0].ciphertext, rows[0].nonce, rows[0].key_id, currentKey());
    } catch {
      throw new SecretVaultError(409, "secret_unavailable", "The secret could not be opened with the configured vault key.");
    }
  }
  const entry = externalEntries().find((item) => item.name === name && item.source === source);
  if (!entry) throw new SecretVaultError(404, "secret_not_found", "That managed secret is no longer available.");
  try {
    const value = source === "environment" ? process.env[name] : entry.path ? fsApi().readFileSync(entry.path, "utf8").replace(/\r?\n$/, "") : undefined;
    if (!value) throw new Error("empty");
    return value;
  } catch {
    throw new SecretVaultError(409, "secret_unavailable", "That managed secret is empty or unreadable.");
  }
}

function auditStep(store: ConsoleStore, actor: SecretActor, action: string, name: string, result: string, now: Date) {
  return {
    sql: "insert into console_audit (id, at, actor_id, actor_label, action, target, result, detail, ip) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    params: [randomUUID(), timeParam(store, now), actor.id, actor.label, action, name, result, JSON.stringify({ secret_name: name }), null],
  };
}

export async function auditSecretAction(
  store: ConsoleStore,
  actor: SecretActor,
  action: "reveal" | "copy" | "create" | "update" | "delete" | "key_rotation",
  name: string,
  result = "success",
): Promise<void> {
  const step = auditStep(store, actor, `secret_${action}`, name, result, new Date());
  await store.driver.execute(step.sql, step.params);
}

export async function createVaultSecret(
  store: ConsoleStore,
  actor: SecretActor,
  input: { name: string; value: string; tags: string[] },
): Promise<void> {
  const existing = await store.driver.query("select id from vault_secrets where name = ?", [input.name]);
  if (existing[0]) throw new SecretVaultError(409, "secret_exists", "A vault secret already uses that name.");
  const now = new Date();
  const encrypted = encryptVaultValue(input.name, input.value, currentKey());
  await store.driver.runAtomically([
    {
      sql: "insert into vault_secrets (id, name, ciphertext, nonce, key_id, tags, created_at, updated_at, created_by, updated_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      params: [randomUUID(), input.name, encrypted.ciphertext, encrypted.nonce, vaultKeyID(currentKey()), JSON.stringify(input.tags), timeParam(store, now), timeParam(store, now), actor.id, actor.id],
    },
    auditStep(store, actor, "secret_create", input.name, "success", now),
  ]);
}

export async function updateVaultSecret(
  store: ConsoleStore,
  actor: SecretActor,
  input: { name: string; value?: string; tags?: string[] },
): Promise<void> {
  const rows = await store.driver.query<VaultRow>("select id, name, ciphertext, nonce, key_id, tags, created_at, updated_at, created_by, updated_by from vault_secrets where name = ?", [input.name]);
  const existing = rows[0];
  if (!existing) throw new SecretVaultError(404, "secret_not_found", "That vault secret no longer exists.");
  const encrypted = input.value === undefined ? existing : encryptVaultValue(input.name, input.value, currentKey());
  const now = new Date();
  await store.driver.runAtomically([
    {
      sql: "update vault_secrets set ciphertext = ?, nonce = ?, key_id = ?, tags = ?, updated_at = ?, updated_by = ? where name = ?",
      params: [encrypted.ciphertext, encrypted.nonce, input.value === undefined ? existing.key_id : vaultKeyID(currentKey()), JSON.stringify(input.tags ?? parseTags(existing.tags)), timeParam(store, now), actor.id, input.name],
    },
    auditStep(store, actor, "secret_update", input.name, "success", now),
  ]);
}

export async function deleteVaultSecret(store: ConsoleStore, actor: SecretActor, name: string): Promise<void> {
  const rows = await store.driver.query("select id from vault_secrets where name = ?", [name]);
  if (!rows[0]) throw new SecretVaultError(404, "secret_not_found", "That vault secret no longer exists.");
  const now = new Date();
  await store.driver.runAtomically([
    { sql: "delete from vault_secrets where name = ?", params: [name] },
    auditStep(store, actor, "secret_delete", name, "success", now),
  ]);
}
