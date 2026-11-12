"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount } from "@/lib/format";
import type { LLMProvider } from "@/server/cryden/admin";

const EMPTY: LLMProvider = {
  kind: "",
  model: "",
  max_tokens: 0,
  api_key_set: false,
  configured: false,
};

export function LLMProviderView() {
  const [provider, setProvider] = useState<LLMProvider | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(true);

  const read = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch("/api/console/llm-provider", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<LLMProvider>(payload);
      if (
        result === null ||
        typeof result.configured !== "boolean" ||
        typeof result.api_key_set !== "boolean"
      ) {
        setFailure({
          message: "The API returned provider settings this screen does not recognise.",
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
        <LoadingAnnouncement>Loading LLM provider settings</LoadingAnnouncement>
      </div>
    );
  }
  if (failure !== null && provider === null) {
    return (
      <div className="view anim">
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
        title="Anthropic"
        hint="This CSAG build can construct an Anthropic provider. Other provider kinds are not implemented by the API."
      >
        <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
          <div>
            <strong>{current.configured ? "Configured" : "Not configured"}</strong>
            <p className="hint">
              Credential: {current.api_key_set ? "saved and redacted" : "not set"}
            </p>
          </div>
          {current.configured ? (
            <span className="mono">
              {current.kind} · {current.model} · {formatCount(current.max_tokens)} max tokens
            </span>
          ) : null}
        </div>
        <div className="actions-row" style={{ marginTop: 14 }}>
          <Button onClick={() => void read()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </Card>
      <Card title="Provider credentials" style={{ marginTop: 18 }}>
        <p className="hint">
          The API returns only whether a credential is saved. This screen never reads, displays, or
          changes provider credentials. Provider writes are disabled by the console&apos;s read-only AI
          policy.
        </p>
      </Card>
    </div>
  );
}
