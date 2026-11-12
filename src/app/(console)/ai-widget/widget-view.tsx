"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import type { AskAIWidgetConfig } from "@/server/cryden/admin";

const EMPTY: AskAIWidgetConfig = {
  enabled: false,
  allowed_origins: [],
  entities: [],
  greeting: "",
  placeholder: "",
};

export function WidgetView() {
  const [config, setConfig] = useState<AskAIWidgetConfig | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(true);

  const read = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch("/api/console/ai-widget", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<AskAIWidgetConfig>(payload);
      if (
        result === null ||
        typeof result.enabled !== "boolean" ||
        !Array.isArray(result.entities) ||
        !Array.isArray(result.allowed_origins)
      ) {
        setFailure({
          message: "The API returned widget settings this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setConfig(result);
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

  if (loading && config === null)
    return (
      <div className="view anim">
        <LoadingAnnouncement>Loading widget settings</LoadingAnnouncement>
      </div>
    );
  if (failure !== null && config === null)
    return (
      <div className="view anim">
        <Card>
          <ErrorState
            title="Widget settings did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read()}
          />
        </Card>
      </div>
    );

  const current = config ?? EMPTY;
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
        title="Widget status"
        hint="Values are returned by CSAG. This screen does not change the configuration."
      >
        <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
          <strong>{current.enabled ? "Enabled" : "Disabled"}</strong>
          <Button onClick={() => void read()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        <div className="detail-list" style={{ marginTop: 14 }}>
          <div className="detail-row">
            <dt>Allowed origins</dt>
            <dd>
              {current.allowed_origins.length ? (
                current.allowed_origins.map((origin) => (
                  <div className="mono" key={origin}>
                    {origin}
                  </div>
                ))
              ) : (
                <span className="hint">None configured</span>
              )}
            </dd>
          </div>
          <div className="detail-row">
            <dt>Allowed entities</dt>
            <dd>
              {current.entities.length ? (
                current.entities.map((entity) => (
                  <div className="mono" key={entity}>
                    {entity}
                  </div>
                ))
              ) : (
                <span className="hint">None configured</span>
              )}
            </dd>
          </div>
          <div className="detail-row">
            <dt>Greeting</dt>
            <dd>{current.greeting || <span className="hint">Not configured</span>}</dd>
          </div>
          <div className="detail-row">
            <dt>Placeholder</dt>
            <dd>{current.placeholder || <span className="hint">Not configured</span>}</dd>
          </div>
        </div>
      </Card>
      <Card title="Embed integration" style={{ marginTop: 18 }}>
        <p className="hint">
          The API exposes settings and serves the widget endpoint. The console does not yet provide
          the embeddable script or generated install snippet.
        </p>
      </Card>
    </div>
  );
}
