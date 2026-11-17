"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { buildAskAIWidgetSnippet } from "@/lib/ask-ai-widget-snippet";
import type { AskAIWidgetConfig } from "@/server/cryden/admin";
import { CSRF_HEADER } from "@/lib/csrf-header";

const ENTITIES = [
  { id: "users", label: "Users" },
  { id: "sessions", label: "Sessions" },
  { id: "audit_events", label: "Audit events" },
] as const;

const EMPTY: AskAIWidgetConfig = {
  enabled: false,
  allowed_origins: [],
  entities: [],
  greeting: "",
  placeholder: "",
};

export function WidgetView({ apiBaseUrl, csrf }: { apiBaseUrl: string; csrf: string }) {
  const [config, setConfig] = useState<AskAIWidgetConfig | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [consoleOrigin, setConsoleOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

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

  function updateConfig(patch: Partial<AskAIWidgetConfig>) {
    setConfig((previous) => ({ ...(previous ?? EMPTY), ...patch }));
    setSaveMessage("");
  }

  async function save() {
    const draft = config ?? EMPTY;
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch("/api/console/ai-widget", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
        body: JSON.stringify(draft),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      const saved = dataFrom<AskAIWidgetConfig>(payload);
      if (saved === null) throw new Error("CSAG did not confirm the widget settings.");
      setConfig(saved);
      setSaveMessage("Widget settings saved.");
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? error.message : "Widget settings could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

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
        hint="The widget answers questions about the signed-in user only. Origins must also be allowed by CSAG CORS."
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
      <Card title="Configuration">
        <label className="field-label" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={current.enabled}
            onChange={(event) => updateConfig({ enabled: event.target.checked })}
          />
          Enable the widget
        </label>
        <div className="field-group">
          <label className="field-label" htmlFor="widget-origins">
            Allowed origins, one per line
          </label>
          <textarea
            id="widget-origins"
            className="text-input mono"
            style={{ minHeight: 92 }}
            value={current.allowed_origins.join("\n")}
            placeholder="https://app.example.com"
            onChange={(event) =>
              updateConfig({
                allowed_origins: event.target.value
                  .split(/\r?\n/)
                  .map((origin) => origin.trim())
                  .filter(Boolean),
              })
            }
          />
          <p className="hint">
            Enter exact origins with scheme and host; do not include a page path or wildcard.
          </p>
        </div>
        <fieldset className="field-group" style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
          <legend className="field-label">Allowed entities</legend>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {ENTITIES.map((entity) => (
              <label
                className="field-label"
                key={entity.id}
                style={{ display: "flex", gap: 10, alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={current.entities.includes(entity.id)}
                  onChange={(event) =>
                    updateConfig({
                      entities: event.target.checked
                        ? [...current.entities, entity.id]
                        : current.entities.filter((value) => value !== entity.id),
                    })
                  }
                />
                {entity.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field-group">
          <label className="field-label" htmlFor="widget-greeting">
            Greeting
          </label>
          <input
            id="widget-greeting"
            className="text-input"
            maxLength={200}
            value={current.greeting}
            onChange={(event) => updateConfig({ greeting: event.target.value })}
            placeholder="Ask a question about your account"
          />
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="widget-placeholder">
            Question placeholder
          </label>
          <input
            id="widget-placeholder"
            className="text-input"
            maxLength={200}
            value={current.placeholder}
            onChange={(event) => updateConfig({ placeholder: event.target.value })}
            placeholder="What would you like to know?"
          />
        </div>
        <div className="actions-row">
          <Button variant="primary" onClick={() => void save()} disabled={saving || loading}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          {saveMessage ? (
            <span className="hint" role="status">
              {saveMessage}
            </span>
          ) : null}
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
            Enable the widget, select at least one entity, add an exact allowed origin, and set a
            greeting above before generating an install snippet.
          </p>
        )}
      </Card>
    </div>
  );
}
