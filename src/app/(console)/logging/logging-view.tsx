"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { SectionState } from "@/components/section-state";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount, formatInstant } from "@/lib/format";
import type { Section } from "@/server/cryden/section";
import type { ShippedLogEvent, ShippedLogs } from "@/server/cryden/admin";
import type { LoggingPage } from "@/server/logging/report";

export function LoggingView() {
  const [level, setLevel] = useState("");
  const [report, setReport] = useState<LoggingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);

  const read = useCallback(async (filter: string) => {
    setLoading(true);
    setFailure(null);
    const query = filter ? `?level=${encodeURIComponent(filter)}` : "";
    try {
      const response = await fetch(`/api/console/logging${query}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<LoggingPage>(payload);
      if (result === null || !isLoggingPage(result)) {
        setFailure({
          message: "The console received a logging report this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setReport(result);
      setLevel(filter);
    } catch {
      setFailure({
        message: "The console could not reach its server.",
        code: "console_unreachable",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void read("");
  }, [read]);

  const columns: Column<ShippedLogEvent>[] = [
    { key: "when", header: "Shipped", cell: (event) => formatInstant(event.shipped_at) },
    {
      key: "level",
      header: "Level",
      cell: (event) => <Pill tone={logLevelTone(event.level)}>{event.level}</Pill>,
    },
    { key: "message", header: "Message", cell: (event) => event.message },
    { key: "sink", header: "Sink", cell: (event) => <span className="mono">{event.sink}</span> },
    {
      key: "fields",
      header: "Redacted fields",
      cell: (event) => <Fields value={event.fields ?? {}} />,
    },
  ];

  if (loading && report === null) {
    return (
      <div className="view anim">
        <LoadingAnnouncement>Loading shipped log events</LoadingAnnouncement>
      </div>
    );
  }
  if (failure !== null && report === null) {
    return (
      <div className="view anim">
        <Card>
          <ErrorState
            title="Cloud logs did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read(level)}
          />
        </Card>
      </div>
    );
  }
  if (report?.state !== "ok") {
    return (
      <div className="view anim">
        <Card>
          <SectionState
            section={report ?? { state: "error", detail: "No report was returned.", code: null }}
            onRetry={() => void read(level)}
          />
        </Card>
      </div>
    );
  }

  const data = report.data;
  return (
    <div className="view anim">
      <Card
        title="Recently shipped"
        hint="These are the redacted records written to the sink, not raw console logs."
      >
        <div className="row-between" style={{ marginTop: 12, gap: 12, flexWrap: "wrap" }}>
          <label className="field-label">
            Minimum level
            <select
              className="text-input"
              value={level}
              onChange={(event) => void read(event.target.value)}
            >
              <option value="">All levels</option>
              {data.levels.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div className="actions-row">
            <span className="hint">{formatCount(data.count)} rows</span>
            <Button onClick={() => void read(level)} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>
      </Card>
      {failure ? (
        <Card>
          <ErrorState
            title="Refresh failed"
            description={failure.message}
            code={failure.code ?? undefined}
          />
        </Card>
      ) : null}
      <DataTable
        caption="Recently shipped cloud log events"
        columns={columns}
        rows={data.events}
        rowKey={(event) => String(event.id)}
        loading={loading}
        minWidthPx={950}
        emptyState={
          <Card title="No shipped events">
            <p className="hint">CSAG has no recent events recorded for this sink.</p>
          </Card>
        }
      />
      <Card title="Sink configuration" style={{ marginTop: 18 }}>
        <p className="hint">
          This API exposes the shipped event history. Provider selection, credentials, redaction
          policy, and delivery settings are deployment configuration and cannot be changed from this
          console.
        </p>
      </Card>
    </div>
  );
}

function Fields({ value }: { value: Record<string, string> }) {
  const entries = Object.entries(value);
  if (entries.length === 0) return <span className="hint">No fields</span>;
  return (
    <span className="mono">{entries.map(([key, field]) => `${key}=${field}`).join(" · ")}</span>
  );
}

function logLevelTone(level: string): "green" | "red" | "amber" | "neutral" {
  if (level === "error") return "red";
  if (level === "warn") return "amber";
  if (level === "info") return "green";
  return "neutral";
}

function isLoggingPage(value: LoggingPage): boolean {
  if (typeof value !== "object" || value === null || !("state" in value)) return false;
  const section = value as Section<ShippedLogs>;
  if (section.state !== "ok")
    return ["unavailable", "forbidden", "empty", "error"].includes(section.state);
  return (
    Array.isArray(section.data.events) &&
    Array.isArray(section.data.levels) &&
    section.data.events.every(
      (event) => typeof event.id === "number" && typeof event.message === "string",
    )
  );
}
