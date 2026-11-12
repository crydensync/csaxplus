"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
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

export function DatabaseProviderView() {
  const [provider, setProvider] = useState<DatabaseProvider | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading && provider === null) {
    return (
      <div className="view anim">
        <LoadingAnnouncement>Loading database provider settings</LoadingAnnouncement>
      </div>
    );
  }
  if (failure !== null && provider === null) {
    return (
      <div className="view anim">
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
    <div className="view anim">
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
        hint="The API tests the supplied database role by attempting a write and confirming that the database refuses it before saving the connection."
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
        <div className="actions-row" style={{ marginTop: 14 }}>
          <Button onClick={() => void read()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </Card>
      <Card title="Credential handling" style={{ marginTop: 18 }}>
        <p className="hint">
          The API never returns the DSN, username, or password. This screen is read-only; provider
          changes require the separate step-up flow, which is not available in this console yet.
        </p>
      </Card>
    </div>
  );
}
