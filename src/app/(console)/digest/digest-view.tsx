"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionState } from "@/components/section-state";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount, formatInstant } from "@/lib/format";
import type { Section } from "@/server/cryden/section";
import type { DigestHistory } from "@/server/cryden/admin";
import type { DigestPage } from "@/server/digest/report";

export function DigestView() {
  const [report, setReport] = useState<DigestPage | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const read = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch("/api/console/digest", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<DigestPage>(payload);
      if (result === null || !isDigestPage(result)) {
        setFailure({
          message: "The API returned digest history this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setReport(result);
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
    void read();
  }, [read]);

  if (loading && report === null) {
    return (
      <div className="view anim digest-history-view">
        <LoadingAnnouncement>Loading digest history</LoadingAnnouncement>
      </div>
    );
  }
  if (failure !== null && report === null) {
    return (
      <div className="view anim digest-history-view">
        <Card>
          <ErrorState
            title="Digest history did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read()}
          />
        </Card>
      </div>
    );
  }
  if (report?.state !== "ok") {
    return (
      <div className="view anim digest-history-view">
        <Card>
          <SectionState
            section={report ?? { state: "error", detail: "No report was returned.", code: null }}
            onRetry={() => void read()}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="view anim digest-history-view">
      <Card title="Digest history" hint="Each report is the text stored when CSAG generated it.">
        <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
          <span className="hint">{formatCount(report.data.count)} stored runs</span>
          <Button onClick={() => void read()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
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
      {report.data.runs.length === 0 ? (
        <Card title="No digests stored">
          <p className="hint">
            No scheduled digest has been stored yet. The Dashboard shows a current report separately.
          </p>
        </Card>
      ) : (
        report.data.runs.map((run) => (
          <Card
            key={run.id}
            title={`Digest ${run.id}`}
            hint={`Generated ${formatInstant(run.generated_at)}`}
          >
            <p className="hint">
              Window: {formatInstant(run.window_start)} to {formatInstant(run.window_end)}
            </p>
            <pre
              className="drawer-json"
              style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
            >
              {run.text}
            </pre>
          </Card>
        ))
      )}
    </div>
  );
}

function isDigestPage(value: DigestPage): boolean {
  if (typeof value !== "object" || value === null || !("state" in value)) return false;
  const section = value as Section<DigestHistory>;
  if (section.state !== "ok")
    return ["unavailable", "forbidden", "empty", "error"].includes(section.state);
  return (
    Array.isArray(section.data.runs) &&
    section.data.runs.every((run) => typeof run.id === "number" && typeof run.text === "string")
  );
}
