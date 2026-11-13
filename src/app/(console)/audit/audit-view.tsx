"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatInstant } from "@/lib/format";
import { auditEventTone } from "@/lib/audit-events";
import type { AuditEvent, AuditEvents, AuditFilters } from "@/server/cryden/admin";

type FilterDraft = { eventType: string; userID: string; since: string; until: string };
const PAGE_SIZE = 50;
const EMPTY_FILTER: FilterDraft = { eventType: "", userID: "", since: "", until: "" };

export function AuditView() {
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTER);
  const [filters, setFilters] = useState<AuditFilters>({});
  const [page, setPage] = useState<AuditEvents | null>(null);
  const [cursorHistory, setCursorHistory] = useState<string[]>([""]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);

  const read = useCallback(
    async (cursor: string, nextPageIndex: number, activeFilters: AuditFilters) => {
      setLoading(true);
      setFailure(null);
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set("cursor", cursor);
      if (activeFilters.eventType) params.set("event_type", activeFilters.eventType);
      if (activeFilters.userID) params.set("user_id", activeFilters.userID);
      if (activeFilters.since) params.set("since", activeFilters.since);
      if (activeFilters.until) params.set("until", activeFilters.until);
      try {
        const response = await fetch(`/api/console/audit?${params}`, {
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          setFailure(failureFrom(payload, response.status));
          return;
        }
        const data = dataFrom<AuditEvents>(payload);
        if (data === null || !isAuditEvents(data)) {
          setFailure({
            message: "The API returned an audit page this screen does not recognise.",
            code: "api_malformed",
          });
          return;
        }
        setPage(data);
        setPageIndex(nextPageIndex);
      } catch {
        setFailure({
          message: "The console could not reach its server.",
          code: "console_unreachable",
        });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void read("", 0, {});
  }, [read]);

  function applyFilters() {
    const next: AuditFilters = {
      eventType: draft.eventType.trim() || undefined,
      userID: draft.userID.trim() || undefined,
      since: draft.since ? new Date(`${draft.since}T00:00:00.000Z`).toISOString() : undefined,
      until: draft.until ? new Date(`${draft.until}T23:59:59.999Z`).toISOString() : undefined,
    };
    setFilters(next);
    setCursorHistory([""]);
    setPageIndex(0);
    void read("", 0, next);
  }

  async function exportCSV() {
    setExporting(true);
    setFailure(null);
    const params = new URLSearchParams();
    if (filters.eventType) params.set("event_type", filters.eventType);
    if (filters.userID) params.set("user_id", filters.userID);
    if (filters.since) params.set("since", filters.since);
    if (filters.until) params.set("until", filters.until);
    try {
      const response = await fetch(`/api/console/audit/export?${params}`, {
        credentials: "same-origin",
        headers: { accept: "text/csv, application/json" },
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download =
        response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        "csax-audit.csv";
      anchor.click();
      URL.revokeObjectURL(href);
    } catch {
      setFailure({
        message: "The console could not reach its server, so the export did not finish.",
        code: "console_unreachable",
      });
    } finally {
      setExporting(false);
    }
  }

  const columns = useMemo<Column<AuditEvent>[]>(
    () => [
      { key: "when", header: "When (UTC)", cell: (event) => formatInstant(event.created_at) },
      {
        key: "event",
        header: "Event",
        cell: (event) => (
          <span className="audit-event-cell">
            <span className={`audit-dot ${auditEventTone(event.type)}`} aria-hidden="true" />
            <span className="audit-event">{event.type}</span>
          </span>
        ),
      },
      {
        key: "user",
        header: "User",
        cell: (event) => (
          <>
            {event.email ?? "Unknown account"}
            {event.user_id ? <div className="hint mono">{event.user_id}</div> : null}
          </>
        ),
      },
      { key: "ip", header: "IP address", cell: (event) => event.ip || "Not recorded" },
      {
        key: "metadata",
        header: "Details",
        cell: (event) => <MetadataView metadata={event.metadata ?? {}} />,
      },
    ],
    [],
  );

  if (loading && page === null)
    return (
      <div className="view anim">
        <LoadingAnnouncement>Loading audit log</LoadingAnnouncement>
      </div>
    );
  if (failure !== null && page === null) {
    return (
      <div className="view anim">
        <Card>
          <ErrorState
            title="Audit log did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read("", 0, filters)}
          />
        </Card>
      </div>
    );
  }

  const queryInput = (
    key: keyof FilterDraft,
    label: string,
    type = "text",
    placeholder?: string,
  ) => (
    <label className="field-label" key={key}>
      {label}
      <input
        className="text-input"
        type={type}
        value={draft[key]}
        placeholder={placeholder}
        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
      />
    </label>
  );

  return (
    <div className="view anim">
      <Card title="Filter events" hint="User filter accepts a CSAG user UUID. Date bounds use UTC.">
        <div className="grid cols-2" style={{ marginTop: 14 }}>
          {queryInput("eventType", "Event type", "text", "login_failed")}
          {queryInput("userID", "User ID", "text", "UUID")}
          {queryInput("since", "From", "date")}
          {queryInput("until", "To", "date")}
        </div>
        <div className="actions-row" style={{ marginTop: 14 }}>
          <Button variant="primary" onClick={applyFilters} disabled={loading}>
            Apply filters
          </Button>
          <Button
            onClick={() => {
              setDraft(EMPTY_FILTER);
              setFilters({});
              setCursorHistory([""]);
              setPageIndex(0);
              void read("", 0, {});
            }}
            disabled={loading}
          >
            Clear
          </Button>
          <Button onClick={() => void exportCSV()} disabled={exporting}>
            {exporting ? "Preparing CSV…" : "Export CSV"}
          </Button>
        </div>
      </Card>
      {failure ? (
        <Card>
          <ErrorState
            title="Audit log action failed"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read(cursorHistory[pageIndex] ?? "", pageIndex, filters)}
          />
        </Card>
      ) : null}
      <div className="row-between" style={{ margin: "18px 0 10px" }}>
        <div className="section-title" style={{ margin: 0 }}>
          Audit events
        </div>
        <span className="hint">{page?.events.length ?? 0} events on this page</span>
      </div>
      <DataTable
        caption="Audit events"
        columns={columns}
        rows={page?.events ?? []}
        rowKey={(event) => event.id}
        loading={loading}
        emptyState={
          <Card title="No matching events">
            <p className="hint">Try a wider date range or clear the filters.</p>
          </Card>
        }
        minWidthPx={1050}
      />
      {page && (pageIndex > 0 || page.has_more) ? (
        <div className="row-between" style={{ marginTop: 16 }}>
          <span className="hint">
            Page {pageIndex + 1}; cursor pagination keeps new events from shifting this page.
          </span>
          <div className="actions-row">
            <Button
              disabled={pageIndex === 0 || loading}
              onClick={() => void read(cursorHistory[pageIndex - 1] ?? "", pageIndex - 1, filters)}
            >
              Previous
            </Button>
            <Button
              disabled={!page.has_more || !page.next_cursor || loading}
              onClick={() => {
                const next = page.next_cursor;
                setCursorHistory((current) => [...current.slice(0, pageIndex + 1), next]);
                void read(next, pageIndex + 1, filters);
              }}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetadataView({ metadata }: { metadata: Record<string, string> }) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return <span className="hint">No details</span>;
  return (
    <dl style={{ margin: 0 }}>
      {entries.map(([key, value]) => (
        <div key={key} style={{ marginBottom: 3 }}>
          <dt className="hint" style={{ display: "inline" }}>
            {key}:{" "}
          </dt>
          <dd className="mono" style={{ display: "inline", margin: 0, overflowWrap: "anywhere" }}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function isAuditEvents(value: AuditEvents): boolean {
  return (
    Array.isArray(value.events) &&
    Number.isInteger(value.limit) &&
    typeof value.has_more === "boolean" &&
    typeof value.next_cursor === "string" &&
    value.events.every((event) => typeof event.id === "string" && typeof event.type === "string")
  );
}
