"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { SectionState } from "@/components/section-state";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount, formatInstant } from "@/lib/format";
import type { Section } from "@/server/cryden/section";
import type { WebhookDeliveries, WebhookDelivery, WebhookStatus } from "@/server/cryden/admin";
import type { WebhookEndpoint } from "@/server/cryden/admin";
import type { WebhookPage } from "@/server/webhooks/report";

const STATUS_TONES: Record<WebhookStatus, "green" | "red" | "amber" | "neutral"> = {
  pending: "amber",
  in_flight: "neutral",
  delivered: "green",
  failed: "red",
};

export function WebhooksView() {
  const [status, setStatus] = useState<WebhookStatus | "">("");
  const [report, setReport] = useState<WebhookPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [endpoint, setEndpoint] = useState<WebhookEndpoint | null>(null);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [endpointSecret, setEndpointSecret] = useState("");
  const [endpointMessage, setEndpointMessage] = useState("");
  const [endpointBusy, setEndpointBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

  const readEndpoint = useCallback(async () => {
    try {
      const response = await fetch("/api/console/webhooks?view=endpoint", { credentials: "same-origin" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      const value = dataFrom<WebhookEndpoint>(payload);
      if (value === null || typeof value.url !== "string" || typeof value.secret_set !== "boolean")
        throw new Error("The endpoint settings response was not recognised.");
      setEndpoint(value);
      setEndpointUrl(value.url);
    } catch (error) {
      setEndpointMessage(error instanceof Error ? error.message : "Endpoint settings could not be loaded.");
    }
  }, []);

  const saveEndpoint = useCallback(async () => {
    setEndpointBusy(true);
    setEndpointMessage("");
    try {
      const response = await fetch("/api/console/webhooks", {
        method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: endpointUrl, ...(endpointSecret ? { secret: endpointSecret } : {}) }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      const value = dataFrom<WebhookEndpoint>(payload);
      if (value === null) throw new Error("The API did not confirm the saved endpoint.");
      setEndpoint(value);
      setEndpointUrl(value.url);
      setEndpointSecret("");
      setEndpointMessage("Webhook endpoint saved.");
    } catch (error) {
      setEndpointMessage(error instanceof Error ? error.message : "Endpoint settings could not be saved.");
    } finally { setEndpointBusy(false); }
  }, [endpointSecret, endpointUrl]);

  const clearEndpoint = useCallback(async () => {
    setEndpointBusy(true);
    setEndpointMessage("");
    try {
      const response = await fetch("/api/console/webhooks", { method: "DELETE", credentials: "same-origin" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      setEndpoint(dataFrom<WebhookEndpoint>(payload));
      setEndpointUrl("");
      setEndpointSecret("");
      setEndpointMessage("Runtime endpoint cleared. Environment settings will be used if configured.");
    } catch (error) {
      setEndpointMessage(error instanceof Error ? error.message : "Endpoint settings could not be cleared.");
    } finally { setEndpointBusy(false); }
  }, []);

  const read = useCallback(async (filter: WebhookStatus | "") => {
    setLoading(true);
    setFailure(null);
    const query = filter ? `?status=${encodeURIComponent(filter)}` : "";
    try {
      const response = await fetch(`/api/console/webhooks${query}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<WebhookPage>(payload);
      if (result === null || !isWebhookPage(result)) {
        setFailure({
          message: "The console received a webhook report this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setReport(result);
      setStatus(filter);
    } catch {
      setFailure({
        message: "The console could not reach its server.",
        code: "console_unreachable",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setTestBusy(true);
    setEndpointMessage("");
    try {
      const response = await fetch("/api/console/webhooks", { method: "POST", credentials: "same-origin" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      const value = dataFrom<{ queued: boolean; event_id: string }>(payload);
      if (value === null || !value.queued) throw new Error("The API did not confirm the test delivery.");
      setEndpointMessage(`Test event queued (${value.event_id}). Check delivery history for its result.`);
      window.setTimeout(() => void read(status), 400);
    } catch (error) {
      setEndpointMessage(error instanceof Error ? error.message : "Test delivery could not be queued.");
    } finally { setTestBusy(false); }
  }, [read, status]);

  useEffect(() => {
    void read("");
    void readEndpoint();
  }, [read, readEndpoint]);

  const columns = useMemo<Column<WebhookDelivery>[]>(
    () => [
      { key: "when", header: "Queued", cell: (item) => formatInstant(item.created_at) },
      {
        key: "event",
        header: "Event",
        cell: (item) => (
          <>
            <span className="mono">{item.event_type}</span>
            <div className="hint mono">{item.event_id || "No event ID"}</div>
          </>
        ),
      },
      {
        key: "status",
        header: "Status",
        cell: (item) => <Pill tone={STATUS_TONES[item.status]}>{item.status}</Pill>,
      },
      { key: "attempts", header: "Attempts", cell: (item) => formatCount(item.attempts) },
      {
        key: "response",
        header: "Response",
        cell: (item) => item.response_code ?? <span className="hint">No response</span>,
      },
      {
        key: "duration",
        header: "Duration",
        cell: (item) => `${formatCount(item.duration_ms)} ms`,
      },
      {
        key: "result",
        header: "Result",
        cell: (item) =>
          item.error ? (
            <span style={{ color: "var(--red)" }}>{item.error}</span>
          ) : item.delivered_at ? (
            <span className="hint">Delivered {formatInstant(item.delivered_at)}</span>
          ) : (
            <span className="hint">Next attempt {formatInstant(item.next_attempt_at)}</span>
          ),
      },
    ],
    [],
  );

  if (loading && report === null)
    return (
      <div className="view anim">
        <LoadingAnnouncement>Loading webhook deliveries</LoadingAnnouncement>
      </div>
    );
  if (failure !== null && report === null) {
    return (
      <div className="view anim">
        <Card>
          <ErrorState
            title="Webhook deliveries did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read(status)}
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
            onRetry={() => void read(status)}
          />
        </Card>
      </div>
    );
  }

  const data: WebhookDeliveries = report.data;
  const options = data.statuses;
  return (
    <div className="view anim">
      <Card
        title="Delivery history"
        hint="This is a record of queued payloads and delivery attempts, not proof that a recipient processed an event."
      >
        <div className="row-between" style={{ marginTop: 12, gap: 12, flexWrap: "wrap" }}>
          <label className="field-label">
            Status
            <select
              className="text-input"
              value={status}
              onChange={(event) => void read(event.target.value as WebhookStatus | "")}
            >
              <option value="">All statuses</option>
              {options.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div className="actions-row">
            <span className="hint">{formatCount(data.count)} rows</span>
            <Button onClick={() => void read(status)} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>
      </Card>
      {failure ? (
        <Card>
          <ErrorState
            title="Webhook deliveries could not refresh"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read(status)}
          />
        </Card>
      ) : null}
      <DataTable
        caption="Webhook delivery attempts"
        columns={columns}
        rows={data.deliveries}
        rowKey={(item) => String(item.id)}
        loading={loading}
        emptyState={
          <Card title="No deliveries">
            <p className="hint">CSAG has no delivery rows for this status.</p>
          </Card>
        }
        minWidthPx={1100}
      />
      <Card title="Webhook endpoint" style={{ marginTop: 18 }}>
        <p className="hint">One runtime destination receives CSAG webhook events. The signing secret is encrypted at rest and never shown again.</p>
        <div style={{ display: "grid", gap: 12, marginTop: 14, maxWidth: 640 }}>
          <label className="field-label">HTTPS endpoint URL<input className="text-input" value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} placeholder="https://example.com/hooks/csag" /></label>
          <label className="field-label">Signing secret{endpoint?.secret_set ? <span className="hint"> · saved; leave blank to keep it</span> : null}<input className="text-input" type="password" autoComplete="new-password" value={endpointSecret} onChange={(event) => setEndpointSecret(event.target.value)} placeholder={endpoint?.secret_set ? "Saved secret is hidden" : "Enter a signing secret"} /></label>
          <div className="actions-row">
            <Button onClick={() => void saveEndpoint()} disabled={endpointBusy || !endpointUrl.trim()}>{endpointBusy ? "Saving…" : "Save endpoint"}</Button>
            <Button onClick={() => void clearEndpoint()} disabled={endpointBusy || (!endpoint?.secret_set && !endpoint?.url)}>Clear runtime endpoint</Button>
            <Button onClick={() => void sendTest()} disabled={testBusy || !endpoint?.secret_set}>{testBusy ? "Queueing…" : "Send test event"}</Button>
            {endpoint?.secret_set ? <Pill tone="green">Signing enabled</Pill> : <Pill tone="amber">No saved endpoint</Pill>}
          </div>
          {endpointMessage ? <p className="hint" role="status">{endpointMessage}</p> : null}
        </div>
      </Card>
    </div>
  );
}

function isWebhookPage(value: WebhookPage): boolean {
  if (typeof value !== "object" || value === null || !("state" in value)) return false;
  const section = value as Section<WebhookDeliveries>;
  if (section.state !== "ok")
    return ["unavailable", "forbidden", "empty", "error"].includes(section.state);
  return (
    Array.isArray(section.data.deliveries) &&
    Array.isArray(section.data.statuses) &&
    section.data.deliveries.every(
      (item) => typeof item.id === "number" && typeof item.status === "string",
    )
  );
}
