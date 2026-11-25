import "server-only";

import { MIGRATIONS } from "../db/migrations";
import { getConsoleStore } from "../db";

export type ConsoleMigrationReport = {
  dialect: "postgres" | "sqlite";
  initialized: boolean;
  current: string | null;
  applied: { id: string; name: string; applied_at: string }[];
  pending: { id: string; name: string }[];
};

/** Read console migration state without creating the tracker or applying DDL. */
export async function readConsoleMigrationStatus(): Promise<ConsoleMigrationReport> {
  const store = getConsoleStore();
  let rows: { id: string; name: string; applied_at: Date | string | number }[];
  try {
    rows = await store.driver.query(
      "select id, name, applied_at from console_migrations order by id",
    );
  } catch (error) {
    if (!isMissingMigrationTable(error)) throw error;
    return {
      dialect: store.dialect,
      initialized: false,
      current: null,
      applied: [],
      pending: MIGRATIONS.map(({ id, name }) => ({ id, name })),
    };
  }

  const applied = rows.map((row) => ({
    id: row.id,
    name: row.name,
    applied_at: asISODate(row.applied_at),
  }));
  const appliedIds = new Set(applied.map((row) => row.id));
  return {
    dialect: store.dialect,
    initialized: true,
    current: applied.at(-1)?.id ?? null,
    applied,
    pending: MIGRATIONS.filter(({ id }) => !appliedIds.has(id)).map(({ id, name }) => ({
      id,
      name,
    })),
  };
}

function asISODate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function isMissingMigrationTable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const detail = error as { code?: unknown; message?: unknown };
  return (
    detail.code === "42P01" ||
    (detail.code === "SQLITE_ERROR" &&
      typeof detail.message === "string" &&
      detail.message.includes("no such table"))
  );
}
