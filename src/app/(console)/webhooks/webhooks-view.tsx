"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { SectionState } from "@/components/section-state";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { CSRF_HEADER } from "@/lib/csrf-header";
import { formatCount, formatInstant } from "@/lib/format";
import type { Section } from "@/server/cryden/section";
import type {
  WebhookDeliveries,
  WebhookDelivery,
  WebhookDestination,
  WebhookEndpointList,
  WebhookStatus,
} from "@/server/cryden/admin";
import type { WebhookPage } from "@/server/webhooks/report";

const STATUS_TONES: Record<WebhookStatus, "green" | "red" | "amber" | "neutral"> = {
  pending: "amber",
  in_flight: "neutral",
  delivered: "green",
  failed: "red",
};

export function WebhooksView({ csrf }: { csrf: string }) {
  const [status, setStatus] = useState<WebhookStatus | "">("");
  const [report, setReport] = useState<WebhookPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [destinationID, setDestinationID] = useState("");
  const [endpoints, setEndpoints] = useState<WebhookDestination[]>([]);
  const [editingID, setEditingID] = useState<string | null>(null);
  const [endpointName, setEndpointName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [endpointSecret, setEndpointSecret] = useState("");
  const [endpointMessage, setEndpointMessage] = useState("");
  const [endpointBusy, setEndpointBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

  const readEndpoint = useCallback(async () => {
    try {
      const response = await fetch("/api/console/webhooks/endpoints", {
        credentials: "same-origin",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      const value = dataFrom<WebhookEndpointList>(payload);
      if (
        value === null ||
        !Array.isArray(value.endpoints) ||
        value.endpoints.some(
          (item) =>
            typeof item.id !== "string" ||
            typeof item.name !== "string" ||
            typeof item.url !== "string" ||
            typeof item.secret_set !== "boolean",
        )
      ) {
        throw new Error("The endpoint settings response was not recognised.");
      }
      setEndpoints(value.endpoints);
    } catch (error) {
      setEndpointMessage(
        error instanceof Error ? error.message : "Endpoint settings could not be loaded.",
      );
    }
  }, []);

  const saveEndpoint = useCallback(async () => {
    setEndpointBusy(true);
    setEndpointMessage("");
    try {
      const response = await fetch(
        editingID
          ? `/api/console/webhooks/endpoints/${encodeURIComponent(editingID)}`
          : "/api/console/webhooks/endpoints",
        {
          method: editingID ? "PUT" : "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
          body: JSON.stringify({
            name: endpointName,
            url: endpointUrl,
            ...(endpointSecret ? { secret: endpointSecret } : {}),
          }),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      const value = dataFrom<WebhookDestination>(payload);
      if (value === null || typeof value.id !== "string")
        throw new Error("The API did not confirm the saved endpoint.");
      setEndpoints((current) =>
        editingID
          ? current.map((endpoint) => (endpoint.id === value.id ? value : endpoint))
          : [...current, value],
      );
      setEditingID(null);
      setEndpointName("");
      setEndpointSecret("");
      setEndpointUrl("");
      setEndpointMessage(editingID ? "Webhook destination updated." : "Webhook destination added.");
    } catch (error) {
      setEndpointMessage(
        error instanceof Error ? error.message : "Endpoint settings could not be saved.",
      );
    } finally {
      setEndpointBusy(false);
    }
  }, [csrf, editingID, endpointName, endpointSecret, endpointUrl]);

  const clearEndpoint = useCallback(
    async (id: string) => {
      if (!window.confirm("Remove this webhook destination?")) return;
      setEndpointBusy(true);
      setEndpointMessage("");
      try {
        const response = await fetch(`/api/console/webhooks/endpoints/${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "same-origin",
          headers: { [CSRF_HEADER]: csrf },
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
        setEndpoints((current) => current.filter((endpoint) => endpoint.id !== id));
        if (editingID === id) {
          setEditingID(null);
          setEndpointName("");
          setEndpointUrl("");
          setEndpointSecret("");
        }
        setEndpointMessage("Webhook destination removed.");
      } catch (error) {
        setEndpointMessage(
          error instanceof Error ? error.message : "Endpoint settings could not be cleared.",
        );
      } finally {
        setEndpointBusy(false);
      }
    },
    [csrf, editingID],
  );

  const read = useCallback(async (filter: WebhookStatus | "", destinationFilter: string) => {
    setLoading(true);
    setFailure(null);
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    if (destinationFilter) params.set("destination_id", destinationFilter);
    try {
      const query = params.size > 0 ? `?${params.toString()}` : "";
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
      setDestinationID(destinationFilter);
    } catch {
      setFailure({
        message: "The console could not reach its server.",
        code: "console_unreachable",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const sendTest = useCallback(
    async (id: string) => {
      setTestBusy(true);
      setEndpointMessage("");
      try {
        const response = await fetch(
          `/api/console/webhooks/endpoints/${encodeURIComponent(id)}/test`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { [CSRF_HEADER]: csrf },
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
        const value = dataFrom<{ queued: boolean; event_id: string; destination_id: string }>(
          payload,
        );
        if (value === null || !value.queued)
          throw new Error("The API did not confirm the test delivery.");
        setEndpointMessage(
          `Test event queued (${value.event_id}). Check delivery history for its result.`,
        );
        window.setTimeout(() => void read(status, destinationID), 400);
      } catch (error) {
        setEndpointMessage(
          error instanceof Error ? error.message : "Test delivery could not be queued.",
        );
      } finally {
        setTestBusy(false);
      }
    },
    [csrf, destinationID, read, status],
  );

  useEffect(() => {
    void read("", "");
    void readEndpoint();
  }, [read, readEndpoint]);

  const columns = useMemo<Column<WebhookDelivery>[]>(
    () => [
      { key: "when", header: "Queued", cell: (item) => formatInstant(item.created_at) },
      {
        key: "destination",
        header: "Destination",
        cell: (item) => (
          <>
            <span>{item.destination_name}</span>
            <div className="hint mono">{item.destination_id}</div>
          </>
        ),
      },
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
            onRetry={() => void read(status, destinationID)}
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
            onRetry={() => void read(status, destinationID)}
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
              onChange={(event) =>
                void read(event.target.value as WebhookStatus | "", destinationID)
              }
            >
              <option value="">All statuses</option>
              {options.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Destination
            <select
              className="text-input"
              value={destinationID}
              onChange={(event) => void read(status, event.target.value)}
            >
              <option value="">All destinations</option>
              {endpoints.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="actions-row">
            <span className="hint">{formatCount(data.count)} rows</span>
            <Button onClick={() => void read(status, destinationID)} disabled={loading}>
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
            onRetry={() => void read(status, destinationID)}
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
      <Card title="Webhook destinations" style={{ marginTop: 18 }}>
        <p className="hint">
          Each active event is queued separately for every destination, with its own retry history.
          Signing secrets are encrypted at rest and never shown again. Removing a destination waits
          until its queued deliveries finish.
        </p>
        {endpoints.length === 0 ? (
          <p className="hint" style={{ marginTop: 12 }}>
            No runtime destinations are configured. An environment destination may still be active.
          </p>
        ) : (
          <div className="system-checks" style={{ marginTop: 14 }}>
            {endpoints.map((item) => (
              <div className="row-between system-check" key={item.id}>
                <div style={{ minWidth: 0 }}>
                  <b>{item.name}</b>
                  <p className="hint mono" style={{ overflowWrap: "anywhere" }}>
                    {item.url}
                  </p>
                  <Pill tone={item.secret_set ? "green" : "amber"}>
                    {item.secret_set ? "Signing enabled" : "Signing unavailable"}
                  </Pill>
                </div>
                <div className="actions-row">
                  <Button
                    onClick={() => {
                      setEditingID(item.id);
                      setEndpointName(item.name);
                      setEndpointUrl(item.url);
                      setEndpointSecret("");
                      setEndpointMessage("");
                    }}
                    disabled={endpointBusy}
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={() => void sendTest(item.id)}
                    disabled={testBusy || !item.secret_set}
                  >
                    {testBusy ? "Queueing…" : "Test"}
                  </Button>
                  <Button onClick={() => void clearEndpoint(item.id)} disabled={endpointBusy}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gap: 12, marginTop: 14, maxWidth: 640 }}>
          <h3>{editingID ? "Edit destination" : "Add destination"}</h3>
          <label className="field-label">
            Destination name
            <input
              className="text-input"
              value={endpointName}
              onChange={(event) => setEndpointName(event.target.value)}
              maxLength={80}
              placeholder="Billing notifications"
            />
          </label>
          <label className="field-label">
            HTTPS endpoint URL
            <input
              className="text-input"
              value={endpointUrl}
              onChange={(event) => setEndpointUrl(event.target.value)}
              placeholder="https://example.com/hooks/csag"
            />
          </label>
          <label className="field-label">
            Signing secret
            {editingID ? <span className="hint"> · saved; leave blank to keep it</span> : null}
            <input
              className="text-input"
              type="password"
              autoComplete="new-password"
              value={endpointSecret}
              onChange={(event) => setEndpointSecret(event.target.value)}
              placeholder={editingID ? "Saved secret is hidden" : "Enter a signing secret"}
            />
          </label>
          <div className="actions-row">
            <Button
              onClick={() => void saveEndpoint()}
              disabled={
                endpointBusy ||
                !endpointName.trim() ||
                !endpointUrl.trim() ||
                (!editingID && !endpointSecret)
              }
            >
              {endpointBusy ? "Saving…" : editingID ? "Save changes" : "Add destination"}
            </Button>
            {editingID ? (
              <Button
                onClick={() => {
                  setEditingID(null);
                  setEndpointName("");
                  setEndpointUrl("");
                  setEndpointSecret("");
                }}
                disabled={endpointBusy}
              >
                Cancel edit
              </Button>
            ) : null}
          </div>
          {endpointMessage ? (
            <p className="hint" role="status">
              {endpointMessage}
            </p>
          ) : null}
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
