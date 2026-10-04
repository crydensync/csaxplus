import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Ground rule 7: no em dashes (U+2014) or en dashes (U+2013) anywhere in code,
 * comments, UI copy, docs or config. The characters are built from code points
 * here so this file does not itself contain what it forbids.
 */
const FORBIDDEN = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)];

const ROOT = process.cwd();

/** Directories we author. The prototype inputs and the build brief are excluded. */
const SCAN_DIRS = ["src", "tests", "docs"];

/** Root-level files we author. Missing ones are skipped. */
const SCAN_ROOT_FILES = [
  ".env.example",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "commitlint.config.mjs",
  "csax.config.example.json",
  "eslint.config.mjs",
  "next.config.ts",
  "package.json",
  "playwright.config.ts",
  "playwright.screenshots.config.ts",
  "tsconfig.json",
  "vitest.config.ts",
];

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sh",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (TEXT_EXTENSIONS.has(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    const full = join(ROOT, dir);
    if (existsSync(full)) walk(full, files);
  }
  for (const name of SCAN_ROOT_FILES) {
    const full = join(ROOT, name);
    if (existsSync(full)) files.push(full);
  }
  return files;
}

describe("ground rule 7", () => {
  it("has no em dashes or en dashes in files we author", () => {
    const offenders: string[] = [];

    for (const file of collectFiles()) {
      const contents = readFileSync(file, "utf8");
      const lines = contents.split("\n");
      lines.forEach((line, index) => {
        if (FORBIDDEN.some((char) => line.includes(char))) {
          offenders.push(`${file.slice(ROOT.length + 1)}:${index + 1}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
