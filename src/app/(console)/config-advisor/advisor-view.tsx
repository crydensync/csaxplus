"use client";

import { useCallback, useEffect, useState } from "react";

import { Card } from "@/components/Card";
import { SectionState } from "@/components/section-state";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount, formatInstant } from "@/lib/format";
import type { Section } from "@/server/cryden/section";
import type { ConfigTuning } from "@/server/cryden/admin";
import type { ConfigAdvisorPage } from "@/server/config-advisor/report";

const WINDOWS = [7, 30, 90, 180, 365];

export function ConfigAdvisorView() {
  const [windowDays, setWindowDays] = useState(30);
  const [report, setReport] = useState<ConfigAdvisorPage | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(true);

  const read = useCallback(async (days: number) => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch(`/api/console/config-advisor?window_days=${days}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<ConfigAdvisorPage>(payload);
      if (result === null || !isTuningPage(result)) {
        setFailure({
          message: "The API returned recommendations this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setReport(result);
      setWindowDays(days);
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
    void read(30);
  }, [read]);

  if (loading && report === null)
    return (
      <div className="view anim">
        <LoadingAnnouncement>Loading configuration recommendations</LoadingAnnouncement>
      </div>
    );
  if (failure !== null && report === null)
    return (
      <div className="view anim">
        <Card>
          <ErrorState
            title="Recommendations did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read(windowDays)}
          />
        </Card>
      </div>
    );
  if (report?.state !== "ok")
    return (
      <div className="view anim">
        <Card>
          <SectionState
            section={report ?? { state: "error", detail: "No report was returned.", code: null }}
            onRetry={() => void read(windowDays)}
          />
        </Card>
      </div>
    );

  const data = report.data;
  const counts = Object.entries(data.counts).sort(([left], [right]) => left.localeCompare(right));
  return (
    <div className="view anim">
      <Card
        title="Evidence window"
        hint={`${formatInstant(data.since)} to ${formatInstant(data.until)}`}
      >
        <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
          <label className="field-label">
            Audit history
            <select
              className="text-input"
              value={windowDays}
              onChange={(event) => void read(Number(event.target.value))}
            >
              {WINDOWS.map((days) => (
                <option key={days} value={days}>
                  {days} days
                </option>
              ))}
            </select>
          </label>
          <span className="hint">API evaluated {formatCount(data.window_days)} days</span>
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
      <Card
        title="Observed events"
        hint="Counts returned by CSAG for the same evidence window used to form recommendations."
      >
        {counts.length === 0 ? (
          <p className="hint">No audit event counts were reported.</p>
        ) : (
          <div className="detail-list">
            {counts.map(([event, count]) => (
              <div className="detail-row" key={event}>
                <dt className="mono">{event}</dt>
                <dd>{formatCount(count)}</dd>
              </div>
            ))}
          </div>
        )}
      </Card>
      {data.suggestions.length === 0 ? (
        <Card title="No recommendations">
          <p className="hint">
            CSAG found no settings that its rules recommend reconsidering for this window.
          </p>
        </Card>
      ) : (
        data.suggestions.map((suggestion, index) => (
          <Card key={`${suggestion.area}-${index}`} title={suggestion.area}>
            <p>
              <strong>Finding</strong>
            </p>
            <p className="hint">{suggestion.finding}</p>
            <p>
              <strong>Suggestion</strong>
            </p>
            <p className="hint">{suggestion.suggestion}</p>
          </Card>
        ))
      )}
      <Card title="Applying a change">
        <p className="hint">
          These are read-only recommendations. This API returns prose rather than a structured
          setting field or suggested value, so the console cannot prefill a control. Review the
          finding, then change settings through their normal owner-managed path.
        </p>
      </Card>
    </div>
  );
}

function isTuningPage(value: ConfigAdvisorPage): boolean {
  if (typeof value !== "object" || value === null || !("state" in value)) return false;
  const section = value as Section<ConfigTuning>;
  if (section.state !== "ok")
    return ["unavailable", "forbidden", "empty", "error"].includes(section.state);
  return (
    Array.isArray(section.data.suggestions) &&
    typeof section.data.counts === "object" &&
    section.data.counts !== null
  );
}
