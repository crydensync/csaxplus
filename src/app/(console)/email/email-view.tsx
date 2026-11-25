"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Card, StatCard } from "@/components/Card";
import { SectionState } from "@/components/section-state";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { describeWindow, formatCount } from "@/lib/format";
import type { EmailStats, EmailTemplates } from "@/server/cryden/admin";
import type { Section } from "@/server/cryden/section";
import type { EmailPage } from "@/server/email/report";

type Load =
  | { kind: "loading" }
  | { kind: "failed"; failure: ConsoleFailure }
  | { kind: "ok"; report: EmailPage };

const CONSOLE_UNREACHABLE: ConsoleFailure = {
  message: "The console could not reach its own server, so email information was not read.",
  code: "console_unreachable",
};

const CONSOLE_MALFORMED: ConsoleFailure = {
  message: "The console answered with a shape this screen does not recognise.",
  code: "console_malformed",
};

export function EmailView() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const inFlight = useRef<AbortController | null>(null);

  const read = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    let response: Response;
    try {
      response = await fetch("/api/console/email", {
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

    const report = dataFrom<EmailPage>(payload);
    if (report === null || !isEmailPage(report)) {
      setLoad({ kind: "failed", failure: CONSOLE_MALFORMED });
      return;
    }
    setLoad({ kind: "ok", report });
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
      <div className="view anim email-view">
        <LoadingAnnouncement>Loading email information</LoadingAnnouncement>
      </div>
    );
  }
  if (load.kind === "failed") {
    return (
      <div className="view anim email-view">
        <Card>
          <ErrorState
            title="Email information did not load"
            description={load.failure.message}
            code={load.failure.code ?? undefined}
            onRetry={retry}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="view anim email-view">
      <ActivitySection section={load.report.stats} onRetry={retry} />
      <TemplatesSection section={load.report.templates} onRetry={retry} />
      <Card title="Product email delivery">
        <p className="hint">
          The product that embeds CSAX Auth provides the email sender used for verification and
          magic links. CSAG’s admin API reports auth events and its own template samples; it does
          not report the product sender’s deliveries or expose a test-send action. Configure and
          test delivery in the product host that provides the sender.
        </p>
      </Card>
    </div>
  );
}

function isEmailPage(value: EmailPage): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    isSection(value.stats) &&
    isSection(value.templates)
  );
}

function isSection(value: unknown): value is Section<unknown> {
  if (typeof value !== "object" || value === null || !("state" in value)) return false;
  return ["ok", "unavailable", "forbidden", "empty", "error"].includes(
    String((value as { state: unknown }).state),
  );
}

function ActivitySection({
  section,
  onRetry,
}: {
  section: Section<EmailStats>;
  onRetry: () => void;
}) {
  if (section.state !== "ok") {
    return (
      <>
        <div className="section-title">Email activity</div>
        <Card>
          <SectionState section={section} onRetry={onRetry} />
        </Card>
      </>
    );
  }

  const { data } = section;
  return (
    <>
      <div className="section-title">Email activity</div>
      <div className="grid cols-3">
        <StatCard
          label="Magic-link requests"
          value={formatCount(data.magic_links_requested_in_window)}
          delta={`${formatCount(data.magic_links_requested)} recorded all time · last ${describeWindow(data.window_days)}`}
        />
        <StatCard
          label="Email changes requested"
          value={formatCount(data.email_changes_requested_in_window)}
          delta={`${formatCount(data.email_changes_requested)} recorded all time · last ${describeWindow(data.window_days)}`}
        />
        <StatCard
          label="Email changes confirmed"
          value={formatCount(data.email_changes_confirmed_in_window)}
          delta={`${formatCount(data.email_changes_confirmed)} recorded all time · last ${describeWindow(data.window_days)}`}
        />
      </div>
      <Card>
        <p className="hint">
          These are audit-event counts, not delivery totals. The API cannot confirm that a message
          reached an inbox. Magic-link requests are counted only when the API records the event;
          requests for unknown accounts are intentionally not distinguishable.
        </p>
      </Card>
    </>
  );
}

function TemplatesSection({
  section,
  onRetry,
}: {
  section: Section<EmailTemplates>;
  onRetry: () => void;
}) {
  if (section.state !== "ok") {
    return (
      <>
        <div className="section-title">Message templates</div>
        <Card>
          <SectionState section={section} onRetry={onRetry} />
        </Card>
      </>
    );
  }

  const { data } = section;
  return (
    <>
      <div className="section-title">Message templates</div>
      <Card
        title="CSAG API template samples"
        hint={
          data.configured
            ? `Read-only files loaded at API startup${data.email_template_dir ? ` from ${data.email_template_dir}` : ""}.`
            : "No template directory is configured; the API uses its built-in message text."
        }
      >
        <div className="grid cols-2">
          {data.kinds.map((template) => (
            <TemplateSample key={template.kind} template={template} />
          ))}
        </div>
        <p className="hint" style={{ marginTop: 16 }}>
          The API renders these plain-text samples on the server. Template files are configured on
          the API host and loaded at startup; this console cannot edit or save them. Sample text is
          displayed as text, never interpreted as HTML.
        </p>
      </Card>
    </>
  );
}

function TemplateSample({ template }: { template: EmailTemplates["kinds"][number] }) {
  return (
    <section>
      <h3>{template.kind === "magic_link" ? "Magic link" : "Email verification"}</h3>
      <p className="hint mono">{template.filename}</p>
      {template.sample_error ? (
        <p role="alert" style={{ color: "var(--red)" }}>
          This configured template could not render: {template.sample_error}
        </p>
      ) : template.configured ? (
        <pre className="digest-text" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {template.sample ?? "The API did not return a rendered sample."}
        </pre>
      ) : (
        <p className="hint">No file is configured for this message type.</p>
      )}
    </section>
  );
}
