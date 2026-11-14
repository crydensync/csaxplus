"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/Button";
import { Card, StatCard } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { SectionState } from "@/components/section-state";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount } from "@/lib/format";
import type { Section } from "@/server/cryden/section";
import type {
  SystemDoctor,
  SystemMigrations,
  SystemPage,
  SystemStats,
} from "@/server/system/status";

type Load =
  | { kind: "loading" }
  | { kind: "failed"; failure: ConsoleFailure }
  | { kind: "ok"; report: SystemPage };

const FAILED_TO_REACH = {
  message: "The console could not reach its server, so system status was not read.",
  code: "console_unreachable",
};

const MALFORMED = {
  message: "The console answered with system data this screen does not recognise.",
  code: "console_malformed",
};

export function SystemView() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const inFlight = useRef<AbortController | null>(null);

  const read = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const response = await fetch("/api/console/system", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setLoad({ kind: "failed", failure: failureFrom(payload, response.status) });
        return;
      }
      const report = dataFrom<SystemPage>(payload);
      if (report === null || !isSystemPage(report)) {
        setLoad({ kind: "failed", failure: MALFORMED });
        return;
      }
      setLoad({ kind: "ok", report });
    } catch {
      if (!controller.signal.aborted) setLoad({ kind: "failed", failure: FAILED_TO_REACH });
    }
  }, []);

  useEffect(() => {
    void read();
    return () => inFlight.current?.abort();
  }, [read]);

  const retry = useCallback(() => {
    setLoad({ kind: "loading" });
    void read();
  }, [read]);

  if (load.kind === "loading") {
    return (
      <div className="view anim">
        <LoadingAnnouncement>Loading system status</LoadingAnnouncement>
      </div>
    );
  }
  if (load.kind === "failed") {
    return (
      <div className="view anim">
        <ErrorState
          title="System status did not load"
          description={load.failure.message}
          code={load.failure.code ?? undefined}
          onRetry={retry}
        />
      </div>
    );
  }

  return (
    <div className="view anim system-view">
      <StatsSection section={load.report.stats} onRetry={retry} />
      <DoctorSection section={load.report.doctor} onRetry={retry} />
      <MigrationsSection section={load.report.migrations} onRetry={retry} />
      <div className="row-between">
        <p className="hint">Values come from the authentication API and its database.</p>
        <Button onClick={retry}>Refresh</Button>
      </div>
    </div>
  );
}

function isSystemPage(value: SystemPage): boolean {
  return isSection(value.stats) && isSection(value.doctor) && isSection(value.migrations);
}

function isSection(value: unknown): value is Section<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "state" in value &&
    ["ok", "unavailable", "forbidden", "empty", "error"].includes(
      String((value as { state: unknown }).state),
    )
  );
}

function StatsSection({
  section,
  onRetry,
}: {
  section: Section<SystemStats>;
  onRetry: () => void;
}) {
  if (section.state !== "ok") {
    return (
      <Card title="Authentication totals">
        <SectionState section={section} onRetry={onRetry} />
      </Card>
    );
  }
  return (
    <section aria-label="Authentication totals">
      <div className="grid cols-4 system-stats">
        <StatCard label="Users" value={formatCount(section.data.users)} />
        <StatCard label="Active sessions" value={formatCount(section.data.active_sessions)} />
        <StatCard label="Operators" value={formatCount(section.data.operators)} />
        <StatCard label="Active API keys" value={formatCount(section.data.active_api_keys)} />
      </div>
    </section>
  );
}

function DoctorSection({
  section,
  onRetry,
}: {
  section: Section<SystemDoctor>;
  onRetry: () => void;
}) {
  if (section.state !== "ok") {
    return (
      <Card title="Deployment checks">
        <SectionState section={section} onRetry={onRetry} />
      </Card>
    );
  }
  const tone = section.data.status === "healthy" ? "green" : "amber";
  return (
    <Card
      title="Deployment checks"
      hint={`Checked ${new Date(section.data.checked_at).toLocaleString()}`}
      action={<Pill tone={tone}>{section.data.status}</Pill>}
    >
      <div className="system-checks">
        {section.data.checks.map((check) => (
          <div className="row-between system-check" key={check.name}>
            <div>
              <b>{check.name === "database" ? "Authentication database" : "Schema migrations"}</b>
              <p className="hint">{check.detail}</p>
            </div>
            <Pill tone={checkTone(check.status)}>{check.status}</Pill>
          </div>
        ))}
      </div>
    </Card>
  );
}

function checkTone(status: string): "green" | "red" | "amber" {
  if (status === "healthy") return "green";
  if (status === "failed") return "red";
  return "amber";
}

function MigrationsSection({
  section,
  onRetry,
}: {
  section: Section<SystemMigrations>;
  onRetry: () => void;
}) {
  if (section.state !== "ok") {
    return (
      <Card title="Authentication schema migrations">
        <SectionState section={section} onRetry={onRetry} />
      </Card>
    );
  }
  const migrations = section.data;
  return (
    <Card
      title="Authentication schema migrations"
      hint={
        migrations.current === null
          ? "No API migration has been recorded."
          : `Current migration: ${migrations.current}`
      }
      action={
        <Pill
          tone={migrations.pending.length + migrations.unknown.length === 0 ? "green" : "amber"}
        >
          {formatCount(migrations.applied.length)} applied
        </Pill>
      }
    >
      {migrations.pending.length + migrations.unknown.length > 0 ? (
        <div className="system-migration-notes">
          {migrations.pending.length > 0 ? (
            <p className="hint">Pending in this API build: {migrations.pending.join(", ")}</p>
          ) : null}
          {migrations.unknown.length > 0 ? (
            <p className="hint">Recorded by another API build: {migrations.unknown.join(", ")}</p>
          ) : null}
        </div>
      ) : null}
      {migrations.applied.length === 0 ? (
        <p className="hint">No applied migrations are recorded.</p>
      ) : (
        <div className="table-wrap">
          <div className="table-scroll">
            <table>
              <caption className="sr-only">Applied authentication schema migrations</caption>
              <thead>
                <tr>
                  <th scope="col">Migration</th>
                  <th scope="col">Applied at</th>
                </tr>
              </thead>
              <tbody>
                {migrations.applied.map((migration) => (
                  <tr key={migration.name}>
                    <td className="mono">{migration.name}</td>
                    <td>{new Date(migration.applied_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
