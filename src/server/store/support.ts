import "server-only";

import { randomUUID } from "node:crypto";

import type { SqlDriver } from "../db/drivers";

/**
 * The differences between the console store's two dialects, in one place.
 *
 * Both engines hold the same schema, but not in the same types: a timestamp is
 * `timestamptz` on Postgres and an integer of unix milliseconds on SQLite, a
 * boolean is `boolean` against `integer` holding 0 or 1, and JSON is `jsonb`
 * against `text`. A repository written once against `SqlDriver` would otherwise
 * carry a dialect test in every statement, so the conversions live here and the
 * repositories call them.
 *
 * The direction matters. `stored*` prepares a value on its way into the
 * database, `read*` copes with whatever the engine hands back.
 */

/** Generates the id for a row this console is creating. */
export function newId(): string {
  return randomUUID();
}

/** A timestamp in the form this dialect stores. */
export function storedInstant(driver: SqlDriver, at: Date): Date | number {
  return driver.dialect === "postgres" ? at : at.getTime();
}

/**
 * A timestamp read back out of either dialect.
 *
 * Postgres would normally answer with a `Date`, but the drizzle handle built in
 * `drivers.ts` replaces the text parsers for the date and timestamp type OIDs,
 * so a value read through the raw driver arrives as the ISO string Postgres
 * sent. SQLite answers with the integer it stored. Both are real answers.
 */
export function readInstant(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw new Error("the console store returned a timestamp this console cannot read");
}

/** A nullable timestamp, which both tables here use for "not yet". */
export function readOptionalInstant(value: unknown): Date | null {
  return value === null || value === undefined ? null : readInstant(value);
}

/** A boolean in the form this dialect stores. */
export function storedBoolean(driver: SqlDriver, value: boolean): boolean | number {
  if (driver.dialect === "postgres") return value;
  return value ? 1 : 0;
}

/** A boolean read back out of either dialect. */
export function readBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  throw new Error("the console store returned a boolean this console cannot read");
}

/**
 * A JSON value on its way in. Serialised for both dialects rather than handed
 * over as an object: `better-sqlite3` accepts only primitives, and a string
 * parameter is what Postgres casts into `jsonb` without being told.
 */
export function storedJson(value: unknown): string {
  return JSON.stringify(value);
}

/** A JSON value read back out of either dialect. */
export function readJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  // Postgres answers a `jsonb` column with the value already parsed.
  return value as T;
}
