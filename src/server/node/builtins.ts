/**
 * Runtime access to Node builtins and to native modules.
 *
 * Next compiles `instrumentation.ts` for the edge runtime as well as for Node,
 * and its bundler follows the dynamic import of the Node-only boot module even
 * though that import sits behind a `NEXT_RUNTIME === "nodejs"` guard. Anything
 * that module reaches is therefore compiled for the edge too, where a static
 * `node:fs` import fails the build with `UnhandledSchemeError` for code the
 * edge never runs.
 *
 * Fetching each builtin through `process.getBuiltinModule` at call time, and
 * each native module through `createRequire` at call time, keeps the import
 * graph free of both. Node 22.3 or newer provides `getBuiltinModule`.
 */

type FsModule = {
  readFileSync(path: string, encoding: "utf8"): string;
  mkdirSync(path: string, options: { recursive: true }): string | undefined;
};

type PathModule = {
  resolve(...parts: string[]): string;
  isAbsolute(path: string): boolean;
  dirname(path: string): string;
  join(...parts: string[]): string;
};

type ModuleModule = {
  createRequire(from: string): (id: string) => unknown;
};

export function builtin<T>(id: string): T {
  const lookup = (process as { getBuiltinModule?: (name: string) => unknown }).getBuiltinModule;
  if (typeof lookup !== "function") {
    throw new Error("csax+ needs Node 22.3 or newer: process.getBuiltinModule is missing");
  }
  return lookup.call(process, id) as T;
}

export function fsApi(): FsModule {
  return builtin<FsModule>("fs");
}

export function pathApi(): PathModule {
  return builtin<PathModule>("path");
}

export function readTextFile(path: string): string {
  return fsApi().readFileSync(path, "utf8");
}

/** Creates `dir` and any missing parent. A no-op when it already exists. */
export function ensureDir(dir: string): void {
  fsApi().mkdirSync(dir, { recursive: true });
}

/**
 * Loads a module that must stay outside the bundle, such as a package with a
 * native binding. Resolution starts at the project root rather than at the
 * bundled file, whose path inside `.next` is not a place `node_modules` can be
 * found from.
 */
export function runtimeRequire<T>(specifier: string): T {
  const { createRequire } = builtin<ModuleModule>("module");
  const from = pathApi().resolve(process.cwd(), "package.json");
  return createRequire(from)(specifier) as T;
}
