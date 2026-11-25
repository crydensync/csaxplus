"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { buildAskAIWidgetSnippet } from "@/lib/ask-ai-widget-snippet";
import type { AskAIWidgetConfig } from "@/server/cryden/admin";

const EMPTY: AskAIWidgetConfig = {
  enabled: false,
  allowed_origins: [],
  entities: [],
  greeting: "",
  placeholder: "",
};

export function WidgetView({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [config, setConfig] = useState<AskAIWidgetConfig | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [consoleOrigin, setConsoleOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

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
    setConsoleOrigin(window.location.origin);
    void read();
  }, [read]);

  const installSnippet = useMemo(() => {
    if (config === null || !consoleOrigin) return "";
    return buildAskAIWidgetSnippet({
      consoleOrigin,
      apiUrl: apiBaseUrl,
      greeting: config.greeting,
      placeholder: config.placeholder,
    });
  }, [apiBaseUrl, config, consoleOrigin]);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(installSnippet);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

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
      <Card title="Embed integration">
        {current.enabled && installSnippet ? (
          <>
            <p className="hint">
              Add this markup to a page on an allowed origin. The script gets a fresh, signed-in
              user&apos;s access token from your application each time the user asks a question.
            </p>
            <div className="row-between" style={{ gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <strong>Install snippet</strong>
              <Button onClick={() => void copySnippet()}>
                {copied ? "Copied" : "Copy snippet"}
              </Button>
            </div>
            <pre className="drawer-json" style={{ marginTop: 8, overflowWrap: "anywhere" }}>
              {installSnippet}
            </pre>
            {copyFailed ? (
              <p className="hint" role="status">
                Clipboard access was denied. Select and copy the snippet manually.
              </p>
            ) : copied ? (
              <p className="hint" role="status">
                Install snippet copied.
              </p>
            ) : null}
            <p className="hint" style={{ marginTop: 14 }}>
              In your app&apos;s JavaScript, define the token callback before users submit a
              question:
            </p>
            <pre className="drawer-json" style={{ marginTop: 8, overflowWrap: "anywhere" }}>
              {"window.csaxGetUserAccessToken = () => authClient.getAccessToken();"}
            </pre>
            <p className="hint" style={{ marginTop: 14 }}>
              Replace <code>authClient.getAccessToken()</code> with your auth SDK&apos;s current
              end-user access token method. Do not provide an admin token or API key. Add each
              embedding site&apos;s exact origin to this widget&apos;s CSAG allowlist and to the
              API&apos;s
              <code> CORS_ORIGINS</code> setting.
            </p>
          </>
        ) : (
          <p className="hint">
            The widget is disabled or has no configured greeting and allowed origins. Enable and
            configure it in CSAG before generating an install snippet.
          </p>
        )}
      </Card>
    </div>
  );
}
