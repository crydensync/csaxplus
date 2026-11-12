import { requireAdmin } from "@/server/auth/guard";
import { responseForFailure } from "@/server/auth/failures";
import { jsonError } from "@/server/auth/response";
import { fetchAuditEvents, type AuditEvent } from "@/server/cryden/admin";

export const dynamic = "force-dynamic";

const EXPORT_LIMIT = 10_000;
const PAGE_SIZE = 100;

function csvCell(value: string): string {
  const safe = /^[\s]*[=+@\-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function row(event: AuditEvent): string {
  return [
    event.created_at,
    event.type,
    event.user_id ?? "",
    event.email ?? "",
    event.ip ?? "",
    JSON.stringify(event.metadata ?? {}),
  ]
    .map(csvCell)
    .join(",");
}

export async function GET(request: Request): Promise<Response> {
  const authorized = await requireAdmin(request);
  if (!authorized.ok) return authorized.response;
  const params = new URL(request.url).searchParams;
  const filters = {
    eventType: params.get("event_type") || undefined,
    userID: params.get("user_id") || undefined,
    since: params.get("since") || undefined,
    until: params.get("until") || undefined,
  };

  const events: AuditEvent[] = [];
  let cursor: string | undefined;
  try {
    do {
      const page = await fetchAuditEvents({
        token: authorized.session.api.accessToken,
        filters,
        cursor,
        limit: PAGE_SIZE,
      });
      events.push(...page.events);
      if (events.length > EXPORT_LIMIT) {
        return authorized.respond(
          jsonError(
            413,
            "export_too_large",
            "Narrow the filters to export at most 10,000 audit events.",
          ),
        );
      }
      if (!page.has_more) break;
      cursor = page.next_cursor;
      if (!cursor)
        return authorized.respond(
          jsonError(
            502,
            "api_malformed",
            "The API did not provide a cursor for the next audit page.",
          ),
        );
    } while (events.length <= EXPORT_LIMIT);
  } catch (error) {
    return authorized.respond(responseForFailure(error));
  }

  const lines = [
    ["created_at", "event_type", "user_id", "email", "ip", "metadata"].map(csvCell).join(","),
    ...events.map(row),
  ];
  const filename = `csax-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  return authorized.respond(
    new Response(`${lines.join("\r\n")}\r\n`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    }),
  );
}
