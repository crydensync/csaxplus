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
import type { LoggingSettings, ShippedLogEvent, ShippedLogs } from "@/server/cryden/admin";
import type { LoggingPage } from "@/server/logging/report";

export function LoggingView({ csrf }: { csrf: string }) {
  const [level, setLevel] = useState("");
  const [report, setReport] = useState<LoggingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [settings, setSettings] = useState<LoggingSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [minLevel, setMinLevel] = useState<LoggingSettings["min_level"]>("info");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);

  const readSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/console/logging/settings", { credentials: "same-origin" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      const value = dataFrom<LoggingSettings>(payload);
      if (value === null || typeof value.enabled !== "boolean" || typeof value.min_level !== "string")
        throw new Error("The logging settings response was not recognised.");
      setSettings(value);
      setEnabled(value.enabled);
      setMinLevel(value.min_level);
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "Logging settings could not be loaded.");
    }
  }, []);

  const saveSettings = useCallback(async () => {
    setSettingsBusy(true);
    setSettingsMessage("");
    try {
      const response = await fetch("/api/console/logging/settings", {
        method: "PUT", credentials: "same-origin",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ enabled, min_level: minLevel }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      const value = dataFrom<LoggingSettings>(payload);
      if (value === null) throw new Error("The API did not confirm the logging settings.");
      setSettings(value);
      setSettingsMessage("Logging settings saved and applied immediately.");
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "Logging settings could not be saved.");
    } finally { setSettingsBusy(false); }
  }, [csrf, enabled, minLevel]);

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
    void readSettings();
  }, [read, readSettings]);

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
      <Card title="CSAG log archive" style={{ marginTop: 18 }}>
        <p className="hint">Enable or pause the redacted archive written to CSAG&apos;s local database. Full-detail JSON logs continue on stdout.</p>
        <div style={{ display: "grid", gap: 12, marginTop: 14, maxWidth: 620 }}>
          <label className="field-label" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Archive redacted records
          </label>
          <label className="field-label">Minimum level
            <select className="text-input" value={minLevel} onChange={(event) => setMinLevel(event.target.value as LoggingSettings["min_level"])}>
              {(["debug", "info", "warn", "error"] as const).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <div className="actions-row">
            <Button variant="primary" onClick={() => void saveSettings()} disabled={settingsBusy || settings === null}>{settingsBusy ? "Saving…" : "Save settings"}</Button>
            {settings ? <Pill tone={settings.enabled ? "green" : "neutral"}>{settings.enabled ? "Archive enabled" : "Archive paused"}</Pill> : null}
          </div>
          {settings ? <p className="hint">Redaction mode: <span className="mono">{settings.redaction}</span>{settings.redaction === "hash" ? ` · hash key ${settings.hash_key_set ? "configured" : "missing"}` : ""}. Redaction policy is set by the CSAG deployment.</p> : null}
          {settingsMessage ? <p className="hint" role="status">{settingsMessage}</p> : null}
        </div>
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
