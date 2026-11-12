"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Card } from "@/components/Card";
import { SectionState } from "@/components/section-state";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { describeWindow, formatCount } from "@/lib/format";
import type { HashMigration } from "@/server/cryden/admin";
import type { PasswordPolicy } from "@/server/cryden/admin";
import type { Section } from "@/server/cryden/section";
import type { PasswordMigrationPage } from "@/server/password-policy/migration";
import { CSRF_HEADER } from "@/lib/csrf-header";

type Load =
  | { kind: "loading" }
  | { kind: "failed"; failure: ConsoleFailure }
  | { kind: "ok"; report: PasswordMigrationPage };

const CONSOLE_UNREACHABLE: ConsoleFailure = {
  message: "The console could not reach its own server, so the hash migration was not read.",
  code: "console_unreachable",
};

const CONSOLE_MALFORMED: ConsoleFailure = {
  message: "The console answered with a shape this screen does not recognise.",
  code: "console_malformed",
};

export function PasswordPolicyView({ csrf }: { csrf: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  const read = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    let response: Response;
    try {
      response = await fetch("/api/console/password-policy", {
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

    const report = dataFrom<PasswordMigrationPage>(payload);
    if (report === null || !isSection(report)) {
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
      <div className="view anim">
        <LoadingAnnouncement>Loading password policy</LoadingAnnouncement>
      </div>
    );
  }
  if (load.kind === "failed") {
    return (
      <div className="view anim">
        <Card>
          <ErrorState
            title="Password settings did not load"
            description={load.failure.message}
            code={load.failure.code ?? undefined}
            onRetry={retry}
          />
        </Card>
      </div>
    );
  }
  if (load.report.migration.state !== "ok") {
    return (
      <div className="view anim">
        <Card>
          <SectionState section={load.report.migration} onRetry={retry} />
        </Card>
      </div>
    );
  }

  async function save(policy: PasswordPolicy) {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/console/password-policy", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json", [CSRF_HEADER]: csrf },
        body: JSON.stringify(policy),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setSaveError(failureFrom(payload, response.status).message);
        return;
      }
      const updated = dataFrom<PasswordPolicy>(payload);
      if (updated === null || !isPasswordPolicy(updated)) {
        setSaveError("The console received an unexpected password policy response.");
        return;
      }
      setLoad((current) => current.kind === "ok"
        ? { kind: "ok", report: { ...current.report, policy: { state: "ok", data: updated } } }
        : current);
      setSaved(true);
    } catch {
      setSaveError("The console could not reach its server. The policy was not saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="view anim">
      <HashMigration report={load.report.migration.data} />
      <div className="section-title">Active password policy</div>
      {load.report.policy.state === "ok" ? (
        <PolicyEditor policy={load.report.policy.data} onSave={save} saving={saving} />
      ) : (
        <Card><SectionState section={load.report.policy} onRetry={retry} /></Card>
      )}
      {saveError ? <p role="alert" className="error-text" style={{ marginTop: 12 }}>{saveError}</p> : null}
      {saved ? <p role="status" className="hint" style={{ marginTop: 12 }}>Password policy saved and active.</p> : null}
      <p className="hint" style={{ marginTop: 18 }}>
        CSAG enforces these rules for signup, password changes and accounts created by an admin.
        Hashes still upgrade automatically after a successful login when the stored hash is weaker
        than the configured hasher.
      </p>
    </div>
  );
}

function isSection(value: unknown): value is PasswordMigrationPage {
  if (typeof value !== "object" || value === null) return false;
  const report = value as { migration?: unknown; policy?: unknown };
  return isReportSection<HashMigration>(report.migration, (data) => "estimated_remaining" in data)
    && isReportSection<PasswordPolicy>(report.policy, isPasswordPolicy);
}

function isReportSection<T>(value: unknown, isData: (data: Record<string, unknown>) => boolean): value is Section<T> {
  if (typeof value !== "object" || value === null || !("state" in value)) return false;
  const section = value as { state: unknown; data?: unknown };
  if (section.state !== "ok") return ["unavailable", "forbidden", "empty", "error"].includes(String(section.state));
  return typeof section.data === "object" && section.data !== null && isData(section.data as Record<string, unknown>);
}

function isPasswordPolicy(value: unknown): value is PasswordPolicy {
  if (typeof value !== "object" || value === null) return false;
  const policy = value as Partial<PasswordPolicy>;
  return Number.isInteger(policy.min_length) && Number.isInteger(policy.max_length)
    && typeof policy.require_uppercase === "boolean" && typeof policy.require_lowercase === "boolean"
    && typeof policy.require_digit === "boolean" && typeof policy.require_symbol === "boolean";
}

function PolicyEditor({
  policy,
  onSave,
  saving,
}: {
  policy: PasswordPolicy;
  onSave: (policy: PasswordPolicy) => Promise<void>;
  saving: boolean;
}) {
  const [draft, setDraft] = useState(policy);
  useEffect(() => setDraft(policy), [policy]);
  const rules: { key: "require_uppercase" | "require_lowercase" | "require_digit" | "require_symbol"; label: string }[] = [
    { key: "require_uppercase", label: "Require an uppercase letter" },
    { key: "require_lowercase", label: "Require a lowercase letter" },
    { key: "require_digit", label: "Require a number" },
    { key: "require_symbol", label: "Require a symbol" },
  ];
  return (
    <Card title="Password requirements" hint="CSAX Auth enforces a minimum of 8 and maximum of 72 bytes; stricter limits are allowed.">
      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <label className="field-label">Minimum length
          <input className="text-input" type="number" min={8} max={72} value={draft.min_length}
            onChange={(event) => setDraft({ ...draft, min_length: Number(event.target.value) })} />
        </label>
        <label className="field-label">Maximum length
          <input className="text-input" type="number" min={draft.min_length} max={72} value={draft.max_length}
            onChange={(event) => setDraft({ ...draft, max_length: Number(event.target.value) })} />
        </label>
      </div>
      <div className="grid cols-2" style={{ marginTop: 16 }}>
        {rules.map(({ key, label }) => (
          <label key={key} className="row-between" style={{ justifyContent: "flex-start", gap: 10, padding: "8px 0" }}>
            <input type="checkbox" checked={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div style={{ marginTop: 18 }}>
        <button className="btn primary" type="button" disabled={saving || draft.min_length < 8 || draft.max_length < draft.min_length || draft.max_length > 72} onClick={() => void onSave(draft)}>
          {saving ? "Saving…" : "Save password policy"}
        </button>
      </div>
    </Card>
  );
}

function HashMigration({ report }: { report: HashMigration }) {
  const estimatedMigrated = Math.max(0, report.total_users - report.estimated_remaining);
  const percent =
    report.total_users === 0 ? 100 : Math.round((estimatedMigrated / report.total_users) * 100);

  return (
    <>
      <div className="section-title">Password hash migration</div>
      <Card
        title={`Configured hasher: ${report.hasher.algorithm}`}
        hint="Hash upgrades happen at successful login when an account has a weaker stored hash."
      >
        {report.hasher.algorithm === "argon2id" ? (
          <p className="hint" style={{ marginTop: 10 }}>
            Argon2id parameters: {report.hasher.memory_kib ?? "—"} KiB memory,{" "}
            {report.hasher.iterations ?? "—"} iterations, {report.hasher.parallelism ?? "—"} lanes.
          </p>
        ) : null}
        <div style={{ marginTop: 18 }}>
          <div className="row-between">
            <span className="hint">Estimated accounts upgraded</span>
            <span className="mono">
              {formatCount(estimatedMigrated)} / {formatCount(report.total_users)} ({percent}%)
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Estimated password hash migration progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            style={{
              marginTop: 8,
              height: 8,
              overflow: "hidden",
              borderRadius: 8,
              background: "var(--surface-3)",
            }}
          >
            <div
              style={{
                width: `${percent}%`,
                height: "100%",
                background: "var(--green)",
                transition: "width 180ms ease",
              }}
            />
          </div>
        </div>
        <div className="grid cols-2" style={{ marginTop: 18 }}>
          <p className="hint">
            {formatCount(report.upgraded_events)} upgrade events recorded all time.
          </p>
          <p className="hint">
            {formatCount(report.upgraded_events_in_window)} upgrade events in the last{" "}
            {describeWindow(report.window_days)}.
          </p>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          The remaining count is an estimate derived from account totals and upgrade events; it is
          not a scan of each stored password hash.
        </p>
      </Card>
    </>
  );
}
