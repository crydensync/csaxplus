import { ConfigError, type ConfigProblem } from "./errors";

/**
 * Node builtins are fetched at call time through `process.getBuiltinModule`
 * rather than imported. Next builds `instrumentation.ts` for the edge runtime as
 * well as Node, and its bundler follows a dynamic import even behind a
 * `NEXT_RUNTIME === "nodejs"` guard, so a static `node:fs` import here breaks the
 * edge compile for code the edge never runs. Node 22.3 or newer provides this.
 */
function builtin<T>(id: string): T {
  const lookup = (process as { getBuiltinModule?: (name: string) => unknown }).getBuiltinModule;
  if (typeof lookup !== "function") {
    throw new Error("csax+ needs Node 22.3 or newer: process.getBuiltinModule is missing");
  }
  return lookup.call(process, id) as T;
}

type FsModule = {
  readFileSync: (path: string, encoding: "utf8") => string;
};
type PathModule = {
  resolve: (...parts: string[]) => string;
  isAbsolute: (path: string) => boolean;
};

function readText(path: string): string {
  return builtin<FsModule>("fs").readFileSync(path, "utf8");
}

function pathApi(): PathModule {
  return builtin<PathModule>("path");
}

/** Where a setting's value came from. Values themselves are never returned here. */
export type ConfigSource = "env" | "env-file" | "file" | "default";

export type ResolvedValue = {
  value: string;
  source: ConfigSource;
};

/** Environment key naming the disk config file. */
export const CONFIG_FILE_ENV = "CSAX_CONFIG_FILE";

/** Used when CONFIG_FILE_ENV is not set. */
export const DEFAULT_CONFIG_FILE = "csax.config.json";

const ENV_FILE_SUFFIX = "_FILE";

/**
 * Reads the optional disk config file. A missing file is not an error, because
 * the file is the local fallback, not a requirement. A file that exists but
 * cannot be parsed is an error: silently ignoring it would mean booting with
 * settings the operator believes they set.
 */
export function readConfigFile(
  env: Readonly<Record<string, string | undefined>>,
  cwd: string = process.cwd(),
): Record<string, unknown> {
  const pathApi_ = pathApi();
  const configured = env[CONFIG_FILE_ENV];
  const path = pathApi_.isAbsolute(configured ?? "")
    ? (configured as string)
    : pathApi_.resolve(cwd, configured ?? DEFAULT_CONFIG_FILE);

  let text: string;
  try {
    text = readText(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new ConfigError([
      { key: CONFIG_FILE_ENV, reason: `could not be read at ${path}` } satisfies ConfigProblem,
    ]);
  }

  if (!path.endsWith(".json")) {
    // Only JSON is supported. TOML is allowed by the brief but would need a
    // parser dependency for a fallback path, so it is left out deliberately.
    throw new ConfigError([
      { key: CONFIG_FILE_ENV, reason: `${path} is not a .json file` } satisfies ConfigProblem,
    ]);
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ConfigError([
      { key: CONFIG_FILE_ENV, reason: `${path} is not valid JSON` } satisfies ConfigProblem,
    ]);
  }
}

/**
 * Resolves one setting, in the order the brief fixes: the environment, then the
 * `_FILE` indirection a container secret mount uses, then the disk config file.
 * A blank environment value falls through, because an empty string in a `.env`
 * file means "not set" far more often than it means "deliberately empty".
 */
export function resolveKey(
  key: string,
  env: Readonly<Record<string, string | undefined>>,
  fileValues: Readonly<Record<string, unknown>>,
): ResolvedValue | undefined {
  const direct = env[key];
  if (direct !== undefined && direct.trim() !== "") {
    return { value: direct, source: "env" };
  }

  const indirectPath = env[`${key}${ENV_FILE_SUFFIX}`];
  if (indirectPath !== undefined && indirectPath.trim() !== "") {
    try {
      const raw = readText(indirectPath).replace(/\r?\n$/, "");
      if (raw.trim() !== "") return { value: raw, source: "env-file" };
    } catch {
      throw new ConfigError([
        { key: `${key}${ENV_FILE_SUFFIX}`, reason: `could not be read at ${indirectPath}` },
      ]);
    }
  }

  const fromFile = fileValues[key];
  if (typeof fromFile === "string" && fromFile.trim() !== "") {
    return { value: fromFile, source: "file" };
  }
  if (typeof fromFile === "number" || typeof fromFile === "boolean") {
    return { value: String(fromFile), source: "file" };
  }

  return undefined;
}
