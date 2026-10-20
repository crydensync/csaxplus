"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Card, StatCard } from "@/components/Card";
import { SectionState } from "@/components/section-state";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { MFA_ADOPTION_NOTE, MFA_FORCE_DISABLE_NOTE } from "@/lib/mfa";
import { describeWindow, formatCount } from "@/lib/format";
// Types only, and deliberately so: `adoption.ts` is server-only, and a value
// import from it would fail the build. Type imports are erased before the
// bundler sees them, which is what lets the browser and the route that feeds it
// agree on one shape instead of two that drift.
import type { MfaAdoption } from "@/server/cryden/admin";
import type { MfaAdoptionPage } from "@/server/mfa/adoption";

/**
 * The MFA & Passkeys screen's data, rendered.
 *
 * One read of the console's route: the second-factor report, which counts
 * enrolment and removal events per factor, all-time and in the API's own
 * window, against the account total. The report has no per-account rows
 * (BACKEND_GAPS 5.2), so there is no activity table to render and no action to
 * hang on one: the tiles are the report, the note says what the counts are,
 * and the force-disable action is pointed at rather than duplicated. See the
 * server module for why the action is not here.
 */

type Load =
  | { kind: "loading" }
  | { kind: "failed"; failure: ConsoleFailure }
  | { kind: "ok"; section: MfaAdoptionPage };

const CONSOLE_UNREACHABLE: ConsoleFailure = {
  message: "The console could not reach its own server, so the report was not read.",
  code: "console_unreachable",
};

const CONSOLE_MALFORMED: ConsoleFailure = {
  message:
    "The console answered the second-factor report with a shape this screen does not recognise.",
  code: "console_malformed",
};

/** The two labels the screen puts on the API's factor names. */
const FACTOR_LABELS: Record<string, string> = {
  totp: "Authenticator apps",
  passkey: "Passkeys",
};

export function MfaView() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const inFlight = useRef<AbortController | null>(null);

  const read = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    let response: Response;
    try {
      response = await fetch("/api/console/mfa/adoption", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) return;
      setLoad({ kind: "failed", failure: CONSOLE_UNREACHABLE });
      return;
    }

    const payload: unknown = await response.json().catch(() => null);
    if (controller.signal.aborted) return;

    if (!response.ok) {
      setLoad({ kind: "failed", failure: failureFrom(payload, response.status) });
      return;
    }

    const report = dataFrom<MfaAdoptionPage>(payload);
    if (report === null) {
      setLoad({ kind: "failed", failure: CONSOLE_MALFORMED });
      return;
    }

    setLoad({ kind: "ok", section: report });
  }, []);

  useEffect(() => {
    void read();
    return () => inFlight.current?.abort();
  }, [read]);

  const retry = useCallback(() => {
    setLoad({ kind: "loading" });
    void read();
  }, [read]);

  let body;
  if (load.kind === "failed") {
    body = (
      <Card>
        <ErrorState
          bare
          title="The second-factor report did not load"
          description={load.failure.message}
          code={load.failure.code ?? undefined}
          onRetry={retry}
        />
      </Card>
    );
  } else if (load.kind === "loading") {
    body = null;
  } else if (load.section.state !== "ok") {
    body = (
      <Card>
        <SectionState section={load.section} onRetry={retry} />
      </Card>
    );
  } else {
    body = <MfaReport report={load.section.data} />;
  }

  return (
    <div className="view anim">
      {load.kind === "loading" ? (
        <LoadingAnnouncement>Loading the second-factor report</LoadingAnnouncement>
      ) : null}
      {body}
    </div>
  );
}

/** One factor's tile, from the report's entry for it. */
function FactorTile({ factor, report }: { factor: string; report: MfaAdoption }) {
  const entry = report.factors.find((candidate) => candidate.factor === factor);
  if (entry === undefined) {
    return (
      <StatCard
        label={labelFor(factor)}
        value="Not reported"
        delta="The API's report does not cover this factor."
      />
    );
  }
  return (
    <StatCard
      label={labelFor(factor)}
      value={formatCount(entry.enrolled_events)}
      delta={`${formatCount(entry.enrolled_events_in_window)} enrolled and ${formatCount(
        entry.removed_events_in_window,
      )} removed in the last ${describeWindow(report.window_days)}`}
      tone={entry.enrolled_events_in_window > entry.removed_events_in_window ? "up" : "neutral"}
    />
  );
}

function labelFor(factor: string): string {
  return FACTOR_LABELS[factor] ?? factor;
}

/** The report itself, once it has arrived. */
function MfaReport({ report }: { report: MfaAdoption }) {
  return (
    <>
      <div className="grid cols-3">
        <FactorTile factor="totp" report={report} />
        <FactorTile factor="passkey" report={report} />
        <StatCard
          label="Accounts"
          value={formatCount(report.total_users)}
          delta="every account the API counts"
        />
      </div>
      <div className="section-title">About these numbers</div>
      <Card>
        <p className="hint">{MFA_ADOPTION_NOTE}</p>
        <p className="hint" style={{ marginTop: 8 }}>
          {MFA_FORCE_DISABLE_NOTE}
        </p>
      </Card>
    </>
  );
}
