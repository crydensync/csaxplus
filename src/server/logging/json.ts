import "server-only";

import type { ConsoleConfig } from "@/server/config";

export type LogLevel = "error" | "warn" | "info" | "debug";

const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export function serializeLog(
  level: LogLevel,
  message: string,
  fields: Readonly<Record<string, string | number | boolean | null>> = {},
  at: Date = new Date(),
): string {
  return `${JSON.stringify({ ...fields, timestamp: at.toISOString(), level, message })}\n`;
}

/** Write one structured process event to stdout. */
export function logJson(
  level: LogLevel,
  message: string,
  threshold: ConsoleConfig["logLevel"] = "info",
  fields: Readonly<Record<string, string | number | boolean | null>> = {},
): void {
  if (ORDER[level] > ORDER[threshold]) return;
  process.stdout.write(serializeLog(level, message, fields));
}
