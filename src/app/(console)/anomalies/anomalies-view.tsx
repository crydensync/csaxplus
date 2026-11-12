"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount, formatInstant } from "@/lib/format";
import { CSRF_HEADER } from "@/lib/csrf-header";
import type { Anomaly, AnomalyList, AnomalyStatus } from "@/server/cryden/admin";

const PAGE_SIZE = 25;
const FILTERS: { value: AnomalyStatus | "all"; label: string }[] = [
  { value: "unreviewed", label: "Needs review" },
  { value: "confirmed", label: "Confirmed" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All events" },
];

export function AnomaliesView({ csrf }: { csrf: string }) {
  const [filter, setFilter] = useState<AnomalyStatus | "all">("unreviewed");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<AnomalyList | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [savingID, setSavingID] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const read = useCallback(async (nextOffset: number, nextFilter: AnomalyStatus | "all") => {
    setLoading(true);
    setFailure(null);
    const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) });
    if (nextFilter !== "all") query.set("status", nextFilter);
    try {
      const response = await fetch(`/api/console/anomalies?${query}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<AnomalyList>(payload);
      if (result === null || !isAnomalyList(result)) {
        setFailure({
          message: "The API returned an anomaly list this screen does not recognise.",
          code: "api_malformed",
        });
        return;
      }
      setPage(result);
      setOffset(nextOffset);
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
    void read(0, "unreviewed");
  }, [read]);

  const onFilter = (next: AnomalyStatus | "all") => {
    setFilter(next);
    setNotice(null);
    void read(0, next);
  };

  const saveReview = useCallback(
    async (event: Anomaly, status: AnomalyStatus, note: string) => {
      setSavingID(event.id);
      setFailure(null);
      setNotice(null);
      try {
        const response = await fetch(`/api/console/anomalies/${encodeURIComponent(event.id)}`, {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            [CSRF_HEADER]: csrf,
          },
          body: JSON.stringify({ status, note }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          setFailure(failureFrom(payload, response.status));
          return;
        }
        setNotice("Review saved.");
        await read(offset, filter);
      } catch {
        setFailure({
          message: "The console could not reach its server. The review was not saved.",
          code: "console_unreachable",
        });
      } finally {
        setSavingID(null);
      }
    },
    [csrf, filter, offset, read],
  );

  const columns = useMemo<Column<Anomaly>[]>(
    () => [
      {
        key: "event",
        header: "Event",
        cell: (event) => (
          <>
            <Pill tone={event.type === "credential_stuffing_detected" ? "amber" : "neutral"}>
              {event.type === "credential_stuffing_detected"
                ? "Credential stuffing"
                : "Anomalous login"}
            </Pill>
            <div className="hint" style={{ marginTop: 7 }}>
              {formatInstant(event.created_at)}
            </div>
          </>
        ),
      },
      {
        key: "signals",
        header: "Signals",
        cell: (event) => <SignalList value={event.metadata?.signals ?? ""} />,
      },
      {
        key: "subject",
        header: "Account / IP",
        cell: (event) => (
          <>
            <span className="mono">{event.user_id ?? "Unknown account"}</span>
            <div className="hint mono">{event.ip ?? "Unknown IP"}</div>
          </>
        ),
      },
      {
        key: "review",
        header: "Review",
        cell: (event) => (
          <ReviewControl event={event} saving={savingID === event.id} onSave={saveReview} />
        ),
      },
    ],
    [saveReview, savingID],
  );

  if (loading && page === null) {
    return (
      <div className="view anim">
        <LoadingAnnouncement>Loading anomaly review queue</LoadingAnnouncement>
      </div>
    );
  }
  if (failure !== null && page === null) {
    return (
      <div className="view anim">
        <Card>
          <ErrorState
            title="Anomaly queue did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read(0, filter)}
          />
        </Card>
      </div>
    );
  }

  const filteredCount = page?.anomalies.length ?? 0;
  return (
    <div className="view anim">
      <div className="row-between" style={{ marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div className="actions-row" role="group" aria-label="Filter anomaly reviews">
          {FILTERS.map((item) => (
            <Button
              key={item.value}
              size="small"
              variant={filter === item.value ? "primary" : "default"}
              aria-pressed={filter === item.value}
              onClick={() => onFilter(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="actions-row">
          <span className="hint">{formatCount(filteredCount)} on this page</span>
          <Button onClick={() => void read(offset, filter)} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>
      {failure ? (
        <Card>
          <ErrorState
            title="Anomalies could not refresh"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read(offset, filter)}
          />
        </Card>
      ) : null}
      {notice ? (
        <p role="status" className="hint" style={{ marginBottom: 12 }}>
          {notice}
        </p>
      ) : null}
      <DataTable
        caption="Flagged login events and their reviews"
        columns={columns}
        rows={page?.anomalies ?? []}
        rowKey={(event) => event.id}
        loading={loading}
        emptyState={
          <Card title={filter === "unreviewed" ? "Nothing needs review" : "No matching events"}>
            <p className="hint">
              {filter === "unreviewed"
                ? "There are no unreviewed anomalies in the available queue."
                : "No events match this review status."}
            </p>
          </Card>
        }
        minWidthPx={1050}
      />
      {page && (offset > 0 || page.has_more) ? (
        <div className="row-between" style={{ marginTop: 16 }}>
          <span className="hint">
            Showing page {Math.floor(offset / PAGE_SIZE) + 1}; the API reports whether another page
            may exist.
          </span>
          <div className="actions-row">
            <Button
              disabled={offset === 0 || loading}
              onClick={() => void read(Math.max(0, offset - PAGE_SIZE), filter)}
            >
              Previous
            </Button>
            <Button
              disabled={!page.has_more || loading || offset + PAGE_SIZE >= 500}
              onClick={() => void read(offset + PAGE_SIZE, filter)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
      <p className="hint" style={{ marginTop: 16 }}>
        Reviewing records a decision and optional note. It does not block a login, revoke a session,
        or change any account.
      </p>
    </div>
  );
}

function SignalList({ value }: { value: string }) {
  const signals = value
    .split(",")
    .map((signal) => signal.trim())
    .filter(Boolean);
  return signals.length === 0 ? (
    <span className="hint">No signal details</span>
  ) : (
    <div className="actions-row">
      {signals.map((signal) => (
        <Pill key={signal} tone="amber">
          {signal}
        </Pill>
      ))}
    </div>
  );
}

function ReviewControl({
  event,
  saving,
  onSave,
}: {
  event: Anomaly;
  saving: boolean;
  onSave: (event: Anomaly, status: AnomalyStatus, note: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<AnomalyStatus>(event.review.status);
  const [note, setNote] = useState(event.review.note);
  useEffect(() => {
    setStatus(event.review.status);
    setNote(event.review.note);
  }, [event.review.status, event.review.note]);
  return (
    <div style={{ minWidth: 250 }}>
      <div className="hint" style={{ marginBottom: 6 }}>
        Current: {event.review.status}
        {event.review.reviewer_id ? ` · ${event.review.reviewer_id}` : ""}
      </div>
      <select
        className="text-input"
        value={status}
        onChange={(input) => setStatus(input.target.value as AnomalyStatus)}
        aria-label="Review decision"
      >
        <option value="unreviewed">Needs review</option>
        <option value="confirmed">Confirm signal</option>
        <option value="dismissed">Dismiss as noise</option>
      </select>
      <textarea
        className="text-input"
        rows={2}
        maxLength={500}
        value={note}
        onChange={(input) => setNote(input.target.value)}
        aria-label="Review note"
        placeholder="Optional note, up to 500 characters"
        style={{ marginTop: 6, minHeight: 58 }}
      />
      <div className="actions-row" style={{ marginTop: 6 }}>
        <Button
          size="small"
          variant="primary"
          disabled={saving || note.length > 500}
          onClick={() => void onSave(event, status, note)}
        >
          {saving ? "Saving…" : "Save review"}
        </Button>
      </div>
    </div>
  );
}

function isAnomalyList(value: AnomalyList): boolean {
  return (
    Number.isInteger(value.limit) &&
    Number.isInteger(value.offset) &&
    typeof value.has_more === "boolean" &&
    Array.isArray(value.anomalies) &&
    value.anomalies.every(
      (event) => typeof event.id === "string" && typeof event.review?.status === "string",
    )
  );
}
