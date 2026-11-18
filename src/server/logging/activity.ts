import "server-only";

import { randomUUID } from "node:crypto";

import { getConsoleStore } from "../db";

export type ConsoleActivityEvent = {
  id: string;
  at: string;
  actor_label: string;
  action: string;
  target: string | null;
  result: string;
  ip: string | null;
};

export type ConsoleActivityPage = {
  events: ConsoleActivityEvent[];
  count: number;
  limit: number;
  offset: number;
};

/** Best-effort console audit entry. Authentication must not depend on this store. */
export async function recordConsoleActivity(input: {
  actor: { id: string; label: string };
  action: "operator_login" | "operator_logout";
}): Promise<void> {
  try {
    const store = getConsoleStore();
    const at = new Date();
    await store.driver.execute(
      "insert into console_audit (id, at, actor_id, actor_label, action, target, result, detail, ip) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        randomUUID(),
        store.dialect === "sqlite" ? at.getTime() : at,
        input.actor.id,
        input.actor.label,
        input.action,
        "console",
        "success",
        null,
        null,
      ],
    );
  } catch {
    // A logging failure must never prevent a valid sign-in or sign-out.
  }
}

type ActivityRow = {
  id: string;
  at: Date | string | number;
  actor_label: string;
  action: string;
  target: string | null;
  result: string;
  ip: string | null;
};

/** Reads only the console's explicit audit records; secret values/details are never selected. */
export async function readConsoleActivity(options: {
  action?: string;
  limit: number;
  offset: number;
}): Promise<ConsoleActivityPage> {
  const store = getConsoleStore();
  const where = options.action ? " where action = ?" : "";
  const params = options.action ? [options.action] : [];
  const counts = await store.driver.query<{ count: number | string }>(
    `select count(*) as count from console_audit${where}`,
    params,
  );
  const rows = await store.driver.query<ActivityRow>(
    `select id, at, actor_label, action, target, result, ip from console_audit${where} order by at desc limit ? offset ?`,
    [...params, options.limit, options.offset],
  );
  return {
    events: rows.map((row) => ({ ...row, at: toISOString(row.at) })),
    count: Number(counts[0]?.count ?? 0),
    limit: options.limit,
    offset: options.offset,
  };
}

function toISOString(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}
