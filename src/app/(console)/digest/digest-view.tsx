"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionState } from "@/components/section-state";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount, formatInstant } from "@/lib/format";
import type { Section } from "@/server/cryden/section";
import type { DigestHistory, DigestReport } from "@/server/cryden/admin";
import type { DigestPage } from "@/server/digest/report";

export function DigestView() {
  const [report, setReport] = useState<DigestPage | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportNow, setReportNow] = useState<DigestReport | null>(null);
  const [reportFailure, setReportFailure] = useState<ConsoleFailure | null>(null);
  const [generating, setGenerating] = useState(false);

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

  const generateNow = async () => {
    setGenerating(true);
    setReportFailure(null);
    try {
      const response = await fetch("/api/console/digest/report?window_days=7", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setReportFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<DigestReport>(payload);
      if (
        result === null ||
        typeof result.text !== "string" ||
        typeof result.window_days !== "number"
      ) {
        setReportFailure({
          message: "The API returned a digest report this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setReportNow(result);
    } catch {
      setReportFailure({
        message: "The console could not reach its server.",
        code: "console_unreachable",
      });
    } finally {
      setGenerating(false);
    }
  };

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
      <Card
        title="Generate a report now"
        hint="Build a read-only report for the last 7 days from CSAG audit data. This preview does not create a scheduled history entry or send email."
      >
        <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
          <span className="hint">
            Use this to check digest content without waiting for the weekly schedule.
          </span>
          <Button variant="primary" onClick={() => void generateNow()} disabled={generating}>
            {generating ? "Generating…" : "Generate report"}
          </Button>
        </div>
        {reportFailure ? (
          <div style={{ marginTop: 16 }}>
            <ErrorState
              title="Digest report could not be generated"
              description={reportFailure.message}
              code={reportFailure.code ?? undefined}
            />
          </div>
        ) : null}
        {reportNow ? (
          <pre
            className="drawer-json"
            style={{ marginTop: 16, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
          >
            {reportNow.text}
          </pre>
        ) : null}
      </Card>
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
          <p className="hint">The API returned an empty history.</p>
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
