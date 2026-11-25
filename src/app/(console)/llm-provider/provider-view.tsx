"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { CSRF_HEADER } from "@/lib/csrf-header";
import { formatCount } from "@/lib/format";
import type { LLMProvider, LLMUsage } from "@/server/cryden/admin";

const EMPTY: LLMProvider = {
  kind: "",
  model: "",
  base_url: "",
  max_tokens: 2048,
  temperature: 0.2,
  rpm: 60,
  api_key_set: false,
  configured: false,
};
type Kind = "anthropic" | "openai-compatible";
type Form = {
  kind: Kind;
  model: string;
  base_url: string;
  api_key: string;
  max_tokens: number;
  temperature: number;
  rpm: number;
};
const blankForm = (): Form => ({
  kind: "openai-compatible",
  model: "",
  base_url: "",
  api_key: "",
  max_tokens: 2048,
  temperature: 0.2,
  rpm: 60,
});

export function LLMProviderView({ csrf }: { csrf: string }) {
  const [provider, setProvider] = useState<LLMProvider | null>(null);
  const [form, setForm] = useState<Form>(blankForm);
  const [models, setModels] = useState<string[]>([]);
  const [usage, setUsage] = useState<LLMUsage | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const read = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const [providerResponse, usageResponse] = await Promise.all([
        fetch("/api/console/llm-provider", {
          credentials: "same-origin",
          headers: { accept: "application/json" },
        }),
        fetch("/api/console/llm-provider/usage", {
          credentials: "same-origin",
          headers: { accept: "application/json" },
        }),
      ]);
      const providerPayload: unknown = await providerResponse.json().catch(() => null);
      if (!providerResponse.ok) {
        setFailure(failureFrom(providerPayload, providerResponse.status));
        return;
      }
      const result = dataFrom<LLMProvider>(providerPayload);
      if (
        !result ||
        typeof result.configured !== "boolean" ||
        typeof result.api_key_set !== "boolean"
      )
        throw new Error("malformed");
      setProvider(result);
      setForm({
        kind: result.kind === "anthropic" ? "anthropic" : "openai-compatible",
        model: result.model,
        base_url: result.base_url,
        api_key: "",
        max_tokens: result.max_tokens || 2048,
        temperature: result.configured ? result.temperature : 0.2,
        rpm: result.configured ? result.rpm : 60,
      });
      if (usageResponse.ok)
        setUsage(dataFrom<LLMUsage>(await usageResponse.json().catch(() => null)));
    } catch {
      setFailure({
        message: "The console could not load provider settings.",
        code: "console_unreachable",
      });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void read();
  }, [read]);

  async function post(path: string, body: unknown) {
    const response = await fetch(path, {
      method: path.endsWith("/llm-provider") ? "PUT" : "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw failureFrom(payload, response.status);
    return dataFrom<unknown>(payload);
  }
  async function loadModels() {
    setBusy(true);
    setFailure(null);
    setNotice("");
    try {
      const result = (await post("/api/console/llm-provider/models", {
        api_key: form.api_key,
        base_url: form.base_url,
      })) as { models?: string[] } | null;
      setModels(result?.models ?? []);
      setNotice(`Loaded ${result?.models?.length ?? 0} models.`);
    } catch (error) {
      setFailure(error as ConsoleFailure);
    } finally {
      setBusy(false);
    }
  }
  async function testProvider() {
    setBusy(true);
    setFailure(null);
    setNotice("");
    try {
      await post("/api/console/llm-provider/test", form);
      setNotice("Provider connection and response format verified.");
    } catch (error) {
      setFailure(error as ConsoleFailure);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setFailure(null);
    setNotice("");
    try {
      const result = (await post("/api/console/llm-provider", form)) as LLMProvider;
      if (!result?.configured) throw new Error("The API did not confirm the saved settings.");
      setProvider(result);
      setForm((current) => ({ ...current, api_key: "" }));
      setNotice("Provider settings saved. The API key remains encrypted on the server.");
      void read();
    } catch (error) {
      setFailure(error as ConsoleFailure);
    } finally {
      setBusy(false);
    }
  }

  if (loading && provider === null)
    return (
      <div className="view anim llm-provider-view">
        <LoadingAnnouncement>Loading LLM provider settings</LoadingAnnouncement>
      </div>
    );
  if (failure && provider === null)
    return (
      <div className="view anim llm-provider-view">
        <Card>
          <ErrorState
            title="Provider settings did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read()}
          />
        </Card>
      </div>
    );
  const current = provider ?? EMPTY;
  const update = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((state) => ({ ...state, [key]: value }));
  return (
    <div className="view anim llm-provider-view">
      {failure ? (
        <Card>
          <ErrorState
            title="Provider operation failed"
            description={failure.message}
            code={failure.code ?? undefined}
          />
        </Card>
      ) : null}
      <Card
        title="AI provider"
        hint="Use Anthropic directly or any service that supports the OpenAI-compatible chat completions API."
      >
        <div className="form-grid">
          <label>
            Protocol
            <select
              value={form.kind}
              onChange={(event) => update("kind", event.target.value as Kind)}
            >
              <option value="openai-compatible">OpenAI-compatible API</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
          {form.kind === "openai-compatible" ? (
            <label>
              Base URL
              <input
                value={form.base_url}
                onChange={(event) => update("base_url", event.target.value)}
                placeholder="https://api.example.com/v1"
                autoComplete="url"
              />
            </label>
          ) : null}
          <label>
            Model
            <input
              list="llm-models"
              value={form.model}
              onChange={(event) => update("model", event.target.value)}
              placeholder="Model identifier"
            />
            <datalist id="llm-models">
              {models.map((model) => (
                <option value={model} key={model} />
              ))}
            </datalist>
          </label>
          <label>
            API key
            <input
              type="password"
              value={form.api_key}
              onChange={(event) => update("api_key", event.target.value)}
              placeholder={
                current.api_key_set ? "Saved; enter a new key to replace" : "Enter API key"
              }
              autoComplete="new-password"
            />
          </label>
          <label>
            Max tokens
            <input
              type="number"
              min={256}
              max={8192}
              value={form.max_tokens}
              onChange={(event) => update("max_tokens", Number(event.target.value))}
            />
          </label>
          <label>
            Temperature
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(event) => update("temperature", Number(event.target.value))}
            />
          </label>
          <label>
            Requests per minute
            <input
              type="number"
              min={1}
              max={10000}
              value={form.rpm}
              onChange={(event) => update("rpm", Number(event.target.value))}
            />
          </label>
        </div>
        <p className="hint">
          Credential: {current.api_key_set ? "saved and redacted" : "not configured"}. The API key
          is never returned to this page. To update settings, enter the key again.
        </p>
        <p className="hint">
          Testing and model discovery can use the saved key without revealing it here. For a new
          provider, enter its API key and model; OpenAI-compatible providers also need a base URL.
        </p>
        <div className="actions-row">
          {form.kind === "openai-compatible" ? (
            <Button
              onClick={() => void loadModels()}
              disabled={busy || (!form.api_key && !current.api_key_set) || !form.base_url}
            >
              {busy ? "Working…" : "Load models"}
            </Button>
          ) : null}
          <Button
            onClick={() => void testProvider()}
            disabled={
              busy ||
              (!form.api_key && !current.api_key_set) ||
              !form.model ||
              (form.kind === "openai-compatible" && !form.base_url)
            }
          >
            {busy ? "Working…" : "Test provider"}
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={
              busy ||
              !form.api_key ||
              !form.model ||
              (form.kind === "openai-compatible" && !form.base_url)
            }
          >
            {busy ? "Working…" : "Save settings"}
          </Button>
          <Button onClick={() => void read()} disabled={loading || busy}>
            Refresh
          </Button>
        </div>
        {notice ? (
          <p role="status" className="hint">
            {notice}
          </p>
        ) : null}
      </Card>
      <Card
        title="AI usage"
        hint="Actual provider requests counted since the CSAG API process started."
      >
        {usage?.providers.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Provider / model</th>
                  <th>Requests</th>
                  <th>Succeeded</th>
                  <th>Failed</th>
                  <th>Rate limited</th>
                  <th>Average</th>
                </tr>
              </thead>
              <tbody>
                {usage.providers.map((item) => (
                  <tr key={`${item.kind}-${item.model}`}>
                    <td>
                      {item.kind} · {item.model}
                    </td>
                    <td>{formatCount(item.requests)}</td>
                    <td>{formatCount(item.succeeded)}</td>
                    <td>{formatCount(item.failed)}</td>
                    <td>{formatCount(item.rate_limited)}</td>
                    <td>{formatCount(item.average_ms)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">
            {usage
              ? "No provider requests recorded in this process yet."
              : "Usage statistics are unavailable."}
          </p>
        )}
      </Card>
    </div>
  );
}
