import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { resetConfigCache } from "@/server/config";
import { openSqliteStore } from "@/server/db/drivers";
import {
  auditSecretAction,
  createVaultSecret,
  decryptVaultValue,
  deleteVaultSecret,
  encryptVaultValue,
  listSecrets,
  revealSecret,
  updateVaultSecret,
} from "@/server/secrets/vault";

const saved = new Map<string, string | undefined>();
const envKeys = ["CSAX_API_URL", "CSAX_SESSION_SECRET", "CSAX_VAULT_KEY", "WEBAUTHN_ORIGIN"];
const key = Buffer.alloc(32, 47);
const plaintext = "do-not-send-this-to-the-browser-in-list";
let dir: string;

afterEach(() => {
  for (const name of envKeys) {
    const previous = saved.get(name);
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
  saved.clear();
  resetConfigCache();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function freshStore() {
  dir = mkdtempSync(join(tmpdir(), "csax-vault-"));
  for (const name of envKeys) saved.set(name, process.env[name]);
  process.env.CSAX_API_URL = "http://127.0.0.1:8080";
  process.env.CSAX_SESSION_SECRET = Buffer.alloc(32, 9).toString("base64");
  process.env.CSAX_VAULT_KEY = key.toString("base64");
  process.env.WEBAUTHN_ORIGIN = "http://localhost:3000";
  resetConfigCache();
  const store = openSqliteStore(join(dir, "console.sqlite"));
  await store.migrate();
  return store;
}

describe("vault encryption", () => {
  it("uses a unique nonce and authenticates the secret name and ciphertext", () => {
    const encrypted = encryptVaultValue("SERVICE_API_KEY", plaintext, key);
    expect(Buffer.from(encrypted.nonce, "base64")).toHaveLength(12);
    expect(encrypted.ciphertext).not.toContain(plaintext);
    expect(
      decryptVaultValue("SERVICE_API_KEY", encrypted.ciphertext, encrypted.nonce, "v1", key),
    ).toBe(plaintext);
    expect(() =>
      decryptVaultValue("OTHER_API_KEY", encrypted.ciphertext, encrypted.nonce, "v1", key),
    ).toThrow();
    const tampered = `${encrypted.ciphertext.slice(0, -4)}AAAA`;
    expect(() =>
      decryptVaultValue("SERVICE_API_KEY", tampered, encrypted.nonce, "v1", key),
    ).toThrow();
  });

  it("stores encrypted values, lists only masked metadata, audits changes, and deletes", async () => {
    const store = await freshStore();
    try {
      const actor = { id: "operator-1", label: "owner@example.test" };
      await createVaultSecret(store, actor, {
        name: "SERVICE_API_KEY",
        value: plaintext,
        tags: ["production"],
      });
      const listed = await listSecrets(store);
      const item = listed.find(
        (secret) => secret.name === "SERVICE_API_KEY" && secret.source === "vault",
      );
      expect(item).toMatchObject({ source: "vault", tags: ["production"], masked: "••••••••" });
      expect(JSON.stringify(listed)).not.toContain(plaintext);
      const stored = await store.driver.query<{ ciphertext: string }>(
        "select ciphertext from vault_secrets where name = ?",
        ["SERVICE_API_KEY"],
      );
      expect(stored[0]?.ciphertext).not.toContain(plaintext);
      expect(await revealSecret(store, "SERVICE_API_KEY", "vault")).toBe(plaintext);

      await updateVaultSecret(store, actor, {
        name: "SERVICE_API_KEY",
        value: "rotated-value",
        tags: ["staging"],
      });
      expect(await revealSecret(store, "SERVICE_API_KEY", "vault")).toBe("rotated-value");
      await auditSecretAction(store, actor, "copy", "SERVICE_API_KEY");
      await deleteVaultSecret(store, actor, "SERVICE_API_KEY");
      expect(await listSecrets(store)).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "SERVICE_API_KEY", source: "vault" }),
        ]),
      );

      const events = await store.driver.query<{ action: string; target: string; detail: string }>(
        "select action, target, detail from console_audit order by at",
      );
      expect(events.map((event) => event.action).sort()).toEqual([
        "secret_copy",
        "secret_create",
        "secret_delete",
        "secret_update",
      ]);
      expect(events.every((event) => event.target === "SERVICE_API_KEY")).toBe(true);
      expect(JSON.stringify(events)).not.toContain(plaintext);
    } finally {
      await store.close();
    }
  });

  it("rotates the database key atomically and reads values with the new key", async () => {
    const store = await freshStore();
    const file = join(dir, "console.sqlite");
    await createVaultSecret(
      store,
      { id: "operator-1", label: "owner@example.test" },
      {
        name: "ROTATION_TEST_TOKEN",
        value: plaintext,
        tags: [],
      },
    );
    await store.close();

    const nextKey = Buffer.alloc(32, 62);
    const nextKeyFile = join(dir, "next-key");
    writeFileSync(nextKeyFile, `${nextKey.toString("base64")}\n`, { mode: 0o600 });
    const result = spawnSync(process.execPath, ["scripts/vault-rotate.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        CSAX_VAULT_KEY: key.toString("base64"),
        CSAX_VAULT_KEY_NEXT_FILE: nextKeyFile,
        CSAX_STORE_URL: "",
        CSAX_STORE_SQLITE_PATH: file,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Re-encrypted 1 vault secret(s)");
    expect(result.stdout).not.toContain(key.toString("base64"));
    expect(result.stdout).not.toContain(nextKey.toString("base64"));
    expect(result.stdout).not.toContain(plaintext);

    process.env.CSAX_VAULT_KEY = nextKey.toString("base64");
    resetConfigCache();
    const rotated = openSqliteStore(file);
    try {
      expect(await revealSecret(rotated, "ROTATION_TEST_TOKEN", "vault")).toBe(plaintext);
      const events = await rotated.driver.query<{ action: string }>(
        "select action from console_audit where action = ?",
        ["secret_key_rotation"],
      );
      expect(events).toHaveLength(1);
    } finally {
      await rotated.close();
    }
  });
});
