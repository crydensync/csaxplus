"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { CSRF_HEADER } from "@/lib/csrf-header";
import { formatCount } from "@/lib/format";
import type { DatabaseProvider } from "@/server/cryden/admin";

const EMPTY: DatabaseProvider = {
  label: "",
  max_rows: 0,
  dsn_set: false,
  host: "",
  database: "",
  configured: false,
};

export function DatabaseProviderView({ csrf }: { csrf: string }) {
  const [provider, setProvider] = useState<DatabaseProvider | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [saveFailure, setSaveFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [dsn, setDsn] = useState("");
  const [maxRows, setMaxRows] = useState(100);
  const [notice, setNotice] = useState("");

  const read = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch("/api/console/database-provider", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<DatabaseProvider>(payload);
      if (
        result === null ||
        typeof result.configured !== "boolean" ||
        typeof result.dsn_set !== "boolean"
      ) {
        setFailure({
          message: "The API returned database settings this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setProvider(result);
      setLabel(result.label || "Local read-only database");
      setMaxRows(result.max_rows || 100);
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveFailure(null);
    setNotice("");
    try {
      const response = await fetch("/api/console/database-provider", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
        body: JSON.stringify({ label, dsn, max_rows: maxRows }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw failureFrom(payload, response.status);
      const saved = dataFrom<DatabaseProvider>(payload);
      if (!saved || !saved.configured || !saved.dsn_set)
        throw new Error("CSAG did not confirm the read-only database settings.");
      setProvider(saved);
      setDsn("");
      setNotice("Saved. CSAG verified that this database role cannot write.");
    } catch (error) {
      setSaveFailure(
        error && typeof error === "object" && "code" in error
          ? (error as ConsoleFailure)
          : {
              message:
                error instanceof Error ? error.message : "Database settings could not be saved.",
              code: "database_provider_save_failed",
            },
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading && provider === null) {
    return (
      <div className="view anim spaced-view">
        <LoadingAnnouncement>Loading database provider settings</LoadingAnnouncement>
      </div>
    );
  }
  if (failure !== null && provider === null) {
    return (
      <div className="view anim spaced-view">
        <Card>
          <ErrorState
            title="Database settings did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read()}
          />
        </Card>
      </div>
    );
  }

  const current = provider ?? EMPTY;
  return (
    <div className="view anim spaced-view">
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
        title="Read-only database"
        hint="This is the data source for AI queries. It can share the auth PostgreSQL database, but use a separate login with SELECT only on crydensync_auth.users, sessions and audit_events. CSAG pins its queries to that schema and verifies table grants before saving."
      >
        <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
          <div>
            <strong>{current.configured ? "Configured" : "Not configured"}</strong>
            <p className="hint">
              Connection string: {current.dsn_set ? "stored and redacted" : "not set"}
            </p>
          </div>
          {current.configured ? (
            <span className="mono">
              {current.label || "Database"} · {formatCount(current.max_rows)} max rows
            </span>
          ) : null}
        </div>
        {current.configured ? (
          <dl className="detail-list" style={{ marginTop: 14 }}>
            <div className="detail-row">
              <dt>Host</dt>
              <dd className="mono">{current.host || "Not available"}</dd>
            </div>
            <div className="detail-row">
              <dt>Database</dt>
              <dd className="mono">{current.database || "Not available"}</dd>
            </div>
          </dl>
        ) : null}
        <form onSubmit={(event) => void save(event)}>
          <div className="form-grid" style={{ marginTop: 18 }}>
            <label>
              Display name
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={120}
                placeholder="Local read-only database"
                required
              />
            </label>
            <label>
              Maximum rows per AI query
              <input
                type="number"
                min={1}
                max={500}
                value={maxRows}
                onChange={(event) => setMaxRows(Number(event.target.value))}
                required
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              PostgreSQL connection string
              <input
                type="password"
                value={dsn}
                onChange={(event) => setDsn(event.target.value)}
                placeholder={
                  current.dsn_set
                    ? "Saved; enter a DSN to replace"
                    : "postgres://readonly:…@localhost:5432/database"
                }
                autoComplete="new-password"
                maxLength={4096}
                required
              />
            </label>
          </div>
          <p className="hint">
            The auth database URL is not reused automatically. Use a PostgreSQL login with SELECT
            only on the CrydenSync auth tables. CSAG ignores database TEMP privileges and rejects
            the save if the role can modify those tables.
          </p>
          {saveFailure ? (
            <div style={{ marginTop: 12 }}>
              <ErrorState
                title="Database settings were not saved"
                description={saveFailure.message}
                code={saveFailure.code ?? undefined}
              />
            </div>
          ) : null}
          {notice ? (
            <p className="hint" role="status" style={{ marginTop: 12 }}>
              {notice}
            </p>
          ) : null}
          <div className="actions-row" style={{ marginTop: 16 }}>
            <Button type="submit" variant="primary" disabled={saving || loading || !dsn.trim()}>
              {saving ? "Checking and saving…" : "Verify and save"}
            </Button>
            <Button type="button" onClick={() => void read()} disabled={loading || saving}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </form>
      </Card>
      <Card title="Credential handling">
        <p className="hint">
          CSAG encrypts the DSN before storing it. The console never reads it back, and a save is
          accepted only after CSAG confirms the role cannot write.
        </p>
      </Card>
    </div>
  );
}
