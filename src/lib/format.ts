/**
 * Formatting the console does on both sides of the wire.
 *
 * Here rather than in a screen's own module because more than one screen reads
 * API records: the dashboard and the Users screen both print an instant the API
 * sent and a count the API computed, and two formatters for one timestamp is two
 * answers to the same question.
 */

/**
 * Formats an instant the API sent, in UTC, with the zone named.
 *
 * UTC rather than the reader's local time on purpose: these timestamps sit
 * beside API-supplied counts and are read next to logs and audit rows, all of
 * which are UTC. Naming the zone is what keeps that from being a guess, and
 * formatting on one clock is also what keeps the server's render and the
 * browser's identical.
 */
export function formatInstant(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "an unreadable time";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(at)} UTC`;
}

/** The date alone, for a table cell where the time of day adds nothing. */
export function formatDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "an unreadable date";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(at);
}

/** `7 days` / `1 day`, for a report whose window the API chose. */
export function describeWindow(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * A count with its thousands separated, on one locale so the same number is
 * written the same way wherever it is read.
 */
export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}
