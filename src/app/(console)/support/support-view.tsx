"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import type { SupportDiagnosis } from "@/server/cryden/admin";

export function SupportView() {
  const [email, setEmail] = useState("");
  const [diagnosis, setDiagnosis] = useState<SupportDiagnosis | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "unavailable">("idle");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDiagnosis(null);
    setFailure(null);
    setCopyState("idle");
    setLoading(true);
    try {
      const response = await fetch(
        `/api/console/support?email=${encodeURIComponent(email.trim())}`,
        {
          credentials: "same-origin",
          headers: { accept: "application/json" },
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<SupportDiagnosis>(payload);
      if (result === null || typeof result.email !== "string" || typeof result.text !== "string") {
        setFailure({
          message: "The API returned a diagnosis this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setDiagnosis(result);
    } catch {
      setFailure({
        message: "The console could not reach its server.",
        code: "console_unreachable",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyDiagnosis = async () => {
    if (diagnosis === null) return;
    try {
      await navigator.clipboard.writeText(`${diagnosis.email}\n\n${diagnosis.text}`);
      setCopyState("copied");
    } catch {
      setCopyState("unavailable");
    }
  };

  return (
    <div className="view anim spaced-view">
      <Card
        title="Diagnose a login issue"
        hint="Enter the exact account email. The API reports lock state, failed attempts, active session count, and recent login failures."
      >
        <form onSubmit={(event) => void submit(event)}>
          <label className="field-label" htmlFor="support-email">
            Account email
          </label>
          <input
            id="support-email"
            className="text-input"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <div className="actions-row" style={{ marginTop: 12 }}>
            <Button type="submit" variant="primary" disabled={loading || !email.trim()}>
              {loading ? "Diagnosing…" : "Run diagnosis"}
            </Button>
          </div>
        </form>
      </Card>
      {loading ? (
        <Card>
          <LoadingAnnouncement>Reading the account diagnosis</LoadingAnnouncement>
        </Card>
      ) : null}
      {failure ? (
        <Card>
          <ErrorState
            title="Diagnosis did not load"
            description={failure.message}
            code={failure.code ?? undefined}
          />
        </Card>
      ) : null}
      {diagnosis ? (
        <Card title={`Diagnosis for ${diagnosis.email}`}>
          <div className="actions-row" style={{ marginBottom: 12 }}>
            <Button type="button" onClick={() => void copyDiagnosis()}>
              {copyState === "copied" ? "Copied" : "Copy diagnosis"}
            </Button>
            {copyState === "copied" ? (
              <span className="hint" role="status">
                Diagnosis copied for your support workflow.
              </span>
            ) : null}
            {copyState === "unavailable" ? (
              <span className="hint" role="status">
                Clipboard access was denied. Select and copy the report manually.
              </span>
            ) : null}
          </div>
          <pre className="drawer-json" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {diagnosis.text}
          </pre>
        </Card>
      ) : null}
      <Card title="Scope and actions">
        <p className="hint">
          This endpoint only reads the named account and its recent login history. It cannot unlock
          an account, reset failures, revoke sessions, or create a support ticket. Ticketing
          integrations are coming soon. For escalation, copy this report into your existing support
          workflow.
        </p>
      </Card>
    </div>
  );
}
