import "server-only";

import { z } from "zod";

import { ConfigError, problemsFromZod, type ConfigProblem } from "./errors";
import { readConfigFile, resolveKey, type ConfigSource } from "./sources";

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off", ""]);

const booleanish = z.string().transform((raw, ctx) => {
  const value = raw.trim().toLowerCase();
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  ctx.addIssue({ code: "custom", message: "must be a boolean" });
  return z.NEVER;
});

/**
 * A 32-byte key, base64 encoded. Used by the session cookie and the vault key.
 * The failure message does not include the value, and the decoded bytes are
 * never logged.
 */
function keyOf32Bytes(what: string) {
  return z.string().refine(
    (raw) => {
      try {
        return Buffer.from(raw, "base64").length === 32;
      } catch {
        return false;
      }
    },
    { message: `must be 32 bytes, base64 encoded (${what})` },
  );
}

const LLM_PROVIDERS = ["anthropic", "openai", "azure-openai", "openai-compatible"] as const;
const LOG_LEVELS = ["error", "warn", "info", "debug"] as const;

const schema = z.object({
  CSAX_API_URL: z.url(),
  CRYDEN_MODE: z.enum(["live", "fixtures"]).default("live"),

  CSAX_STORE_URL: z.url().optional(),
  CSAX_STORE_SQLITE_PATH: z.string().min(1).optional(),

  READONLY_DATABASE_URL: z.url().optional(),

  CSAX_SESSION_SECRET: keyOf32Bytes("session cookie signing"),
  CSAX_VAULT_KEY: keyOf32Bytes("vault encryption"),

  WEBAUTHN_ORIGIN: z.url(),

  RESEND_API_KEY: z.string().min(1).optional(),

  LLM_PROVIDER: z.enum(LLM_PROVIDERS).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),

  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  SKIP_AUTO_MIGRATE: booleanish.default(false),
});

/** Settings whose value must never reach a browser, a log line or an error message. */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "CSAX_STORE_URL",
  "READONLY_DATABASE_URL",
  "CSAX_SESSION_SECRET",
  "CSAX_VAULT_KEY",
  "RESEND_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
]);

export type StoreConfig = { kind: "postgres"; url: string } | { kind: "sqlite"; path: string };

export type ConsoleConfig = {
  api: { url: string; mode: "live" | "fixtures" };
  store: StoreConfig;
  readonlyDatabaseUrl: string | undefined;
  session: { secret: Uint8Array };
  vault: { key: Uint8Array };
  webauthn: { origin: string };
  email: { resendApiKey: string | undefined };
  llm: {
    provider: (typeof LLM_PROVIDERS)[number] | undefined;
    anthropicApiKey: string | undefined;
    openaiApiKey: string | undefined;
  };
  logLevel: (typeof LOG_LEVELS)[number];
  skipAutoMigrate: boolean;
};

export type ConfigEntry = {
  key: string;
  source: ConfigSource;
  sensitive: boolean;
};

/** Local SQLite location used when neither store target is configured. */
export const DEFAULT_SQLITE_PATH = ".csaxplus/console.sqlite";

type Loaded = {
  config: ConsoleConfig;
  entries: ReadonlyArray<ConfigEntry>;
};

function collect(
  env: Readonly<Record<string, string | undefined>>,
  cwd: string,
): { values: Record<string, string>; sources: Map<string, ConfigSource> } {
  const fileValues = readConfigFile(env, cwd);
  const values: Record<string, string> = {};
  const sources = new Map<string, ConfigSource>();

  for (const key of Object.keys(schema.shape)) {
    const resolved = resolveKey(key, env, fileValues);
    if (resolved === undefined) continue;
    values[key] = resolved.value;
    sources.set(key, resolved.source);
  }

  return { values, sources };
}

function storeFrom(parsed: z.infer<typeof schema>): StoreConfig {
  if (parsed.CSAX_STORE_URL !== undefined) {
    return { kind: "postgres", url: parsed.CSAX_STORE_URL };
  }
  if (parsed.CSAX_STORE_SQLITE_PATH !== undefined) {
    return { kind: "sqlite", path: parsed.CSAX_STORE_SQLITE_PATH };
  }
  // Neither is set. The engine requires exactly one and refuses to guess, but
  // the console is a small local tool: a file under the working directory is a
  // safe, non-sensitive default that lets a checkout run without a database.
  return { kind: "sqlite", path: DEFAULT_SQLITE_PATH };
}

function toConfig(parsed: z.infer<typeof schema>): ConsoleConfig {
  return {
    api: { url: parsed.CSAX_API_URL, mode: parsed.CRYDEN_MODE },
    store: storeFrom(parsed),
    readonlyDatabaseUrl: parsed.READONLY_DATABASE_URL,
    session: { secret: new Uint8Array(Buffer.from(parsed.CSAX_SESSION_SECRET, "base64")) },
    vault: { key: new Uint8Array(Buffer.from(parsed.CSAX_VAULT_KEY, "base64")) },
    webauthn: {
      origin: parsed.WEBAUTHN_ORIGIN,
    },
    email: { resendApiKey: parsed.RESEND_API_KEY },
    llm: {
      provider: parsed.LLM_PROVIDER,
      anthropicApiKey: parsed.ANTHROPIC_API_KEY,
      openaiApiKey: parsed.OPENAI_API_KEY,
    },
    logLevel: parsed.LOG_LEVEL,
    skipAutoMigrate: parsed.SKIP_AUTO_MIGRATE,
  };
}

/**
 * Validates every setting at once and throws a single ConfigError listing all of
 * them. Never logs or returns a value, so the failure is safe to print.
 */
export function loadConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
  cwd: string = process.cwd(),
): Loaded {
  const { values, sources } = collect(env, cwd);
  const result = schema.safeParse(values);

  if (!result.success) {
    throw new ConfigError(problemsFromZod(result.error));
  }

  // Both store targets at once is ambiguous. The Go engine treats this as a
  // startup error and so do we, rather than picking one and hiding the mistake.
  if (
    result.data.CSAX_STORE_URL !== undefined &&
    result.data.CSAX_STORE_SQLITE_PATH !== undefined
  ) {
    throw new ConfigError([
      {
        key: "CSAX_STORE_URL",
        reason: "cannot be set together with CSAX_STORE_SQLITE_PATH, pick one",
      } satisfies ConfigProblem,
    ]);
  }

  const entries: ReadonlyArray<ConfigEntry> = Object.keys(schema.shape).map((key) => ({
    key,
    source: sources.get(key) ?? "default",
    sensitive: SENSITIVE_KEYS.has(key),
  }));

  return { config: toConfig(result.data), entries };
}

let cached: Loaded | undefined;

/** The process-wide configuration. Validated on first use, then reused. */
export function getConfig(): ConsoleConfig {
  cached ??= loadConfig();
  return cached.config;
}

/**
 * Which source each setting came from, for the Settings screen. Deliberately
 * returns no values: the screen shows provenance, never content.
 */
export function describeConfig(): ReadonlyArray<ConfigEntry> {
  cached ??= loadConfig();
  return cached.entries;
}

/** Test hook. Not called from application code. */
export function resetConfigCache(): void {
  cached = undefined;
}
