"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { ErrorState } from "@/components/states";
import { dataFrom, failureFrom } from "@/lib/console-response";
import { formatCount, formatInstant } from "@/lib/format";
import type { ShippedLogEvent, ShippedLogs } from "@/server/cryden/admin";
import type { Section } from "@/server/cryden/section";
import type { ConsoleActivityEvent, ConsoleActivityPage } from "@/server/logging/activity";

export function ActivityView() {
  const [runtime, setRuntime] = useState<Section<ShippedLogs> | null>(null);
  const [activity, setActivity] = useState<ConsoleActivityPage | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setRuntimeError("");
    setActivityError("");
    const [runtimeResult, activityResult] = await Promise.allSettled([
      fetch("/api/console/logging/runtime", { credentials: "same-origin" }),
      fetch("/api/console/logging/activity?limit=50", { credentials: "same-origin" }),
    ]);
    if (runtimeResult.status === "rejected") {
      setRuntimeError("The runtime log feed could not be reached.");
    } else {
      const payload: unknown = await runtimeResult.value.json().catch(() => null);
      if (!runtimeResult.value.ok)
        setRuntimeError(failureFrom(payload, runtimeResult.value.status).message);
      else {
        const value = dataFrom<Section<ShippedLogs>>(payload);
        if (value === null || !isSection(value))
          setRuntimeError("The runtime log response was not recognised.");
        else setRuntime(value);
      }
    }
    if (activityResult.status === "rejected") {
      setActivityError("Console activity could not be reached.");
    } else {
      const payload: unknown = await activityResult.value.json().catch(() => null);
      if (!activityResult.value.ok)
        setActivityError(failureFrom(payload, activityResult.value.status).message);
      else {
        const value = dataFrom<ConsoleActivityPage>(payload);
        if (value === null || !isActivityPage(value))
          setActivityError("The activity response was not recognised.");
        else setActivity(value);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runtimeColumns: Column<ShippedLogEvent>[] = [
    { key: "when", header: "Time", cell: (row) => formatInstant(row.shipped_at) },
    {
      key: "level",
      header: "Level",
      cell: (row) => (
        <Pill tone={row.level === "error" ? "red" : row.level === "warn" ? "amber" : "neutral"}>
          {row.level}
        </Pill>
      ),
    },
    { key: "message", header: "Message", cell: (row) => row.message },
    {
      key: "fields",
      header: "Redacted fields",
      cell: (row) => (
        <span className="mono">
          {Object.entries(row.fields ?? {})
            .map(([key, value]) => `${key}=${value}`)
            .join(" · ") || "-"}
        </span>
      ),
    },
  ];
  const activityColumns: Column<ConsoleActivityEvent>[] = [
    { key: "at", header: "Time", cell: (row) => formatInstant(row.at) },
    { key: "actor", header: "Operator", cell: (row) => row.actor_label },
    { key: "action", header: "Action", cell: (row) => <span className="mono">{row.action}</span> },
    { key: "target", header: "Target", cell: (row) => row.target ?? "-" },
    { key: "result", header: "Result", cell: (row) => row.result },
  ];

  return (
    <div className="view anim spaced-view">
      <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
        <p className="hint">
          Runtime logs reset when CSAG restarts. Console activity is stored in the console database.
        </p>
        <Button onClick={() => void refresh()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh activity"}
        </Button>
      </div>
      <Card
        title="CSAG structured runtime logs"
        hint="Recent redacted engine events held in this CSAG process. Raw startup and migration output is not included; the persistent shipped-log archive is a separate source."
      >
        {runtimeError ? (
          <ErrorState title="Runtime logs did not load" description={runtimeError} />
        ) : null}
        {runtime?.state === "ok" ? (
          <DataTable
            caption="CSAG runtime logs"
            columns={runtimeColumns}
            rows={runtime.data.events}
            rowKey={(row) => String(row.id)}
            loading={loading}
            minWidthPx={800}
            emptyState={
              <p className="hint">No runtime records are available in this process yet.</p>
            }
          />
        ) : runtime ? (
          <p className="hint">
            Runtime logs are {runtime.state}: {"detail" in runtime ? runtime.detail : "unavailable"}
          </p>
        ) : null}
      </Card>
      <Card
        title="Console activity"
        hint="Sign-ins, sign-outs, and recorded console actions. Secret values, tokens, and request bodies are not included."
      >
        {activityError ? (
          <ErrorState title="Console activity did not load" description={activityError} />
        ) : null}
        {activity ? (
          <DataTable
            caption="Console activity"
            columns={activityColumns}
            rows={activity.events}
            rowKey={(row) => row.id}
            loading={loading}
            minWidthPx={700}
            emptyState={<p className="hint">No console activity has been recorded yet.</p>}
          />
        ) : null}
        {activity ? (
          <p className="hint" style={{ marginTop: 10 }}>
            {formatCount(activity.count)} total events · showing {activity.events.length}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function isSection(value: Section<ShippedLogs>): boolean {
  if (typeof value !== "object" || value === null || !("state" in value)) return false;
  if (value.state !== "ok")
    return ["unavailable", "forbidden", "empty", "error"].includes(value.state);
  return Array.isArray(value.data?.events) && Array.isArray(value.data?.levels);
}

function isActivityPage(value: ConsoleActivityPage): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray(value.events) &&
    typeof value.count === "number" &&
    value.events.every((row) => typeof row.id === "string" && typeof row.action === "string")
  );
}
