import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { ConfigError } from "@/server/config/errors";
import {
  DEFAULT_SQLITE_PATH,
  describeConfig,
  getConfig,
  loadConfig,
  resetConfigCache,
} from "@/server/config/index";
import { readConfigFile, resolveKey } from "@/server/config/sources";

const SESSION_SECRET = Buffer.alloc(32, 1).toString("base64");
const VAULT_KEY = Buffer.alloc(32, 2).toString("base64");

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    CSAX_API_URL: "http://127.0.0.1:8080",
    CSAX_SESSION_SECRET: SESSION_SECRET,
    CSAX_VAULT_KEY: VAULT_KEY,
    WEBAUTHN_RP_ID: "localhost",
    WEBAUTHN_ORIGIN: "http://localhost:3000",
    ...overrides,
  };
}

/** A directory with no csax.config.json in it, so the disk fallback stays quiet. */
function emptyDir() {
  return mkdtempSync(join(tmpdir(), "csax-config-"));
}

describe("resolveKey", () => {
  it("prefers the environment over the disk file", () => {
    const resolved = resolveKey(
      "CSAX_API_URL",
      { CSAX_API_URL: "http://from-env" },
      { CSAX_API_URL: "http://from-file" },
    );
    expect(resolved).toEqual({ value: "http://from-env", source: "env" });
  });

  it("reads a *_FILE indirection and trims the trailing newline", () => {
    const dir = emptyDir();
    const secretPath = join(dir, "api-url");
    writeFileSync(secretPath, "http://from-mounted-secret\n");

    const resolved = resolveKey("CSAX_API_URL", { CSAX_API_URL_FILE: secretPath }, {});
    expect(resolved).toEqual({ value: "http://from-mounted-secret", source: "env-file" });
  });

  it("treats a blank environment value as unset and falls through to the file", () => {
    const resolved = resolveKey(
      "CSAX_API_URL",
      { CSAX_API_URL: "   " },
      {
        CSAX_API_URL: "http://from-file",
      },
    );
    expect(resolved).toEqual({ value: "http://from-file", source: "file" });
  });
});

describe("readConfigFile", () => {
  it("returns nothing when the file is absent", () => {
    expect(readConfigFile({}, emptyDir())).toEqual({});
  });

  it("refuses a file that exists but is not valid JSON", () => {
    const dir = emptyDir();
    writeFileSync(join(dir, "broken.json"), "{ not json");
    expect(() => readConfigFile({ CSAX_CONFIG_FILE: "broken.json" }, dir)).toThrow(ConfigError);
  });

  it("refuses a format it does not parse instead of ignoring it", () => {
    const dir = emptyDir();
    writeFileSync(join(dir, "csax.config.toml"), 'CSAX_API_URL = "http://127.0.0.1"\n');
    expect(() => readConfigFile({ CSAX_CONFIG_FILE: "csax.config.toml" }, dir)).toThrow(
      ConfigError,
    );
  });
});

describe("loadConfig", () => {
  it("resolves the required settings and applies documented defaults", () => {
    const { config } = loadConfig(baseEnv(), emptyDir());

    expect(config.api).toEqual({ url: "http://127.0.0.1:8080", mode: "live" });
    expect(config.webauthn.rpName).toBe("csax+ console");
    expect(config.logLevel).toBe("info");
    expect(config.skipAutoMigrate).toBe(false);
    expect(config.session.secret).toHaveLength(32);
    expect(config.vault.key).toHaveLength(32);
  });

  it("reports every missing key at once, and none of the values", () => {
    let caught: unknown;
    try {
      loadConfig({}, emptyDir());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConfigError);
    const error = caught as ConfigError;
    expect(error.keys).toContain("CSAX_API_URL");
    expect(error.keys).toContain("CSAX_SESSION_SECRET");
    expect(error.keys).toContain("CSAX_VAULT_KEY");
    expect(error.keys).toContain("WEBAUTHN_ORIGIN");

    // A short key must not make it into the message.
    const shortKey = Buffer.alloc(4, 9).toString("base64");
    try {
      loadConfig(baseEnv({ CSAX_VAULT_KEY: shortKey }), emptyDir());
      expect.unreachable("expected a ConfigError");
    } catch (thrown) {
      expect((thrown as Error).message).not.toContain(shortKey);
    }
  });

  it("accepts the boolean spellings an operator is likely to write", () => {
    for (const spelling of ["1", "true", "yes", "on", "TRUE"]) {
      const { config } = loadConfig(baseEnv({ SKIP_AUTO_MIGRATE: spelling }), emptyDir());
      expect(config.skipAutoMigrate).toBe(true);
    }
    const { config } = loadConfig(baseEnv({ SKIP_AUTO_MIGRATE: "0" }), emptyDir());
    expect(config.skipAutoMigrate).toBe(false);
  });

  it("refuses a value that is neither true nor false", () => {
    expect(() => loadConfig(baseEnv({ SKIP_AUTO_MIGRATE: "maybe" }), emptyDir())).toThrow(
      ConfigError,
    );
  });

  it("selects Postgres when a store URL is given", () => {
    const { config } = loadConfig(
      baseEnv({ CSAX_STORE_URL: "postgres://console@example.invalid:5432/console" }),
      emptyDir(),
    );
    expect(config.store.kind).toBe("postgres");
  });

  it("falls back to a local SQLite file when no store is configured", () => {
    const { config } = loadConfig(baseEnv(), emptyDir());
    expect(config.store).toEqual({ kind: "sqlite", path: DEFAULT_SQLITE_PATH });
  });

  it("refuses both store targets at once, the way the engine does", () => {
    expect(() =>
      loadConfig(
        baseEnv({
          CSAX_STORE_URL: "postgres://console@example.invalid:5432/console",
          CSAX_STORE_SQLITE_PATH: "./console.sqlite",
        }),
        emptyDir(),
      ),
    ).toThrow(ConfigError);
  });

  it("takes a value from the disk config file when the environment has none", () => {
    const dir = emptyDir();
    writeFileSync(
      join(dir, "csax.config.json"),
      JSON.stringify({ CSAX_API_URL: "http://from-disk:9000", LOG_LEVEL: "debug" }),
    );

    const env = baseEnv({ CSAX_API_URL: undefined });
    const { config } = loadConfig(env, dir);
    expect(config.api.url).toBe("http://from-disk:9000");
    expect(config.logLevel).toBe("debug");
  });
});

describe("describeConfig", () => {
  beforeEach(() => {
    resetConfigCache();
    process.env.CSAX_API_URL = "http://127.0.0.1:8080";
    process.env.CSAX_SESSION_SECRET = SESSION_SECRET;
    process.env.CSAX_VAULT_KEY = VAULT_KEY;
    process.env.WEBAUTHN_RP_ID = "localhost";
    process.env.WEBAUTHN_ORIGIN = "http://localhost:3000";
  });

  it("reports provenance and never a value", () => {
    const entries = describeConfig();
    const apiUrl = entries.find((entry) => entry.key === "CSAX_API_URL");

    expect(apiUrl).toEqual({ key: "CSAX_API_URL", source: "env", sensitive: false });
    expect(JSON.stringify(entries)).not.toContain(SESSION_SECRET);

    const logLevel = entries.find((entry) => entry.key === "LOG_LEVEL");
    expect(logLevel?.source).toBe("default");
  });

  it("marks the settings that must never be shown", () => {
    const entries = describeConfig();
    const sensitive = entries.filter((entry) => entry.sensitive).map((entry) => entry.key);
    expect(sensitive).toContain("CSAX_SESSION_SECRET");
    expect(sensitive).toContain("CSAX_VAULT_KEY");
    expect(sensitive).toContain("CSAX_STORE_URL");
    expect(sensitive).not.toContain("CSAX_API_URL");
  });

  it("validates once and reuses the result", () => {
    const first = getConfig();
    const second = getConfig();
    expect(second).toBe(first);
  });
});
