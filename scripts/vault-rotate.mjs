import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decryptVaultValue, encryptVaultValue, vaultKeyID } from "../src/server/secrets/crypto.mjs";

try {
  process.loadEnvFile(".env.local");
} catch {}
try {
  process.loadEnvFile(".env");
} catch {}

function keyFrom(raw, label) {
  const value = Buffer.from(raw.trim(), "base64");
  if (value.length !== 32) throw new Error(`${label} must contain a base64 encoded 32-byte key`);
  return value;
}

function currentKey() {
  const raw =
    process.env.CSAX_VAULT_KEY ??
    (process.env.CSAX_VAULT_KEY_FILE ? readFileSync(process.env.CSAX_VAULT_KEY_FILE, "utf8") : "");
  return keyFrom(raw, "CSAX_VAULT_KEY");
}

function nextKey() {
  const file = process.env.CSAX_VAULT_KEY_NEXT_FILE;
  if (!file)
    throw new Error("Set CSAX_VAULT_KEY_NEXT_FILE to a protected file containing the new key");
  return keyFrom(readFileSync(file, "utf8"), "CSAX_VAULT_KEY_NEXT_FILE");
}

async function rotatePostgres(url, oldKey, newKey, nextID) {
  const postgres = (await import("postgres")).default;
  const sql = postgres(url, { max: 1 });
  try {
    return await sql.begin(async (tx) => {
      const rows = await tx`select name, ciphertext, nonce, key_id from vault_secrets for update`;
      const updates = rows.map((row) => {
        const value = decryptVaultValue(row.name, row.ciphertext, row.nonce, row.key_id, oldKey);
        return { name: row.name, ...encryptVaultValue(row.name, value, newKey) };
      });
      for (const item of updates) {
        await tx`update vault_secrets set ciphertext = ${item.ciphertext}, nonce = ${item.nonce}, key_id = ${nextID}, updated_at = now() where name = ${item.name}`;
      }
      await tx`insert into console_audit (id, at, actor_id, actor_label, action, target, result, detail, ip)
        values (${randomUUID()}, now(), 'system:cli', 'vault rotation CLI', 'secret_key_rotation', '*', 'success', ${JSON.stringify({ rotated: updates.length })}::jsonb, null)`;
      return updates.length;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function rotateSqlite(file, oldKey, newKey, nextID) {
  const imported = await import("better-sqlite3");
  const Database = imported.default;
  const db = new Database(file);
  try {
    const rows = db.prepare("select name, ciphertext, nonce, key_id from vault_secrets").all();
    const updates = rows.map((row) => {
      const value = decryptVaultValue(row.name, row.ciphertext, row.nonce, row.key_id, oldKey);
      return { name: row.name, ...encryptVaultValue(row.name, value, newKey) };
    });
    const run = db.transaction(() => {
      const update = db.prepare(
        "update vault_secrets set ciphertext = ?, nonce = ?, key_id = ?, updated_at = ? where name = ?",
      );
      for (const item of updates)
        update.run(item.ciphertext, item.nonce, nextID, Date.now(), item.name);
      db.prepare(
        "insert into console_audit (id, at, actor_id, actor_label, action, target, result, detail, ip) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        randomUUID(),
        Date.now(),
        "system:cli",
        "vault rotation CLI",
        "secret_key_rotation",
        "*",
        "success",
        JSON.stringify({ rotated: updates.length }),
        null,
      );
    });
    run();
    return updates.length;
  } finally {
    db.close();
  }
}

try {
  const storeURL = process.env.CSAX_STORE_URL;
  const sqlitePath = process.env.CSAX_STORE_SQLITE_PATH ?? ".csaxplus/console.sqlite";
  if (storeURL && process.env.CSAX_STORE_SQLITE_PATH)
    throw new Error("Set only one of CSAX_STORE_URL and CSAX_STORE_SQLITE_PATH");
  const oldKey = currentKey();
  const newKey = nextKey();
  const oldID = vaultKeyID(oldKey);
  const nextID = vaultKeyID(newKey);
  if (oldID === nextID) throw new Error("The new vault key must differ from the current key");
  const count = storeURL
    ? await rotatePostgres(storeURL, oldKey, newKey, nextID)
    : await rotateSqlite(resolve(sqlitePath), oldKey, newKey, nextID);
  process.stdout.write(`Re-encrypted ${count} vault secret(s) under key id ${nextID}.\n`);
  process.stdout.write(
    "Keep the console stopped, update CSAX_VAULT_KEY to the protected new key, then start every console instance.\n",
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Vault key rotation failed"}\n`);
  process.exitCode = 1;
}
