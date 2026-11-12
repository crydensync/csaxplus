"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount } from "@/lib/format";
import type { AskAIAnswer } from "@/server/cryden/admin";

export function AssistantView({ csrf }: { csrf: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskAIAnswer | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAnswer(null);
    setFailure(null);
    setLoading(true);
    try {
      const response = await fetch("/api/console/ai", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({ question }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<AskAIAnswer>(payload);
      if (
        result === null ||
        typeof result.answer !== "string" ||
        typeof result.row_count !== "number"
      ) {
        setFailure({
          message: "The API returned an answer this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setAnswer(result);
    } catch {
      setFailure({
        message: "The console could not reach its server.",
        code: "console_unreachable",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="view anim ai-assistant-view">
      <Card
        title="Ask about your account"
        hint="CSAG scopes every query to the identity in your signed-in token. This API has no field for selecting another user."
      >
        <form onSubmit={(event) => void submit(event)}>
          <label className="field-label" htmlFor="ai-question">
            Question
          </label>
          <textarea
            id="ai-question"
            className="text-input"
            rows={4}
            maxLength={500}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="For example: show my recent login sessions"
          />
          <div className="row-between" style={{ marginTop: 8, gap: 12, flexWrap: "wrap" }}>
            <span className="hint">
              {question.length}/500 characters. Each request uses the configured model provider.
            </span>
            <Button type="submit" variant="primary" disabled={loading || !question.trim()}>
              {loading ? "Asking…" : "Ask"}
            </Button>
          </div>
        </form>
      </Card>
      {failure ? (
        <Card>
          <ErrorState
            title="The assistant could not answer"
            description={failure.message}
            code={failure.code ?? undefined}
          />
        </Card>
      ) : null}
      {answer ? (
        <Card
          title="Answer"
          hint={`${formatCount(answer.row_count)} rows returned from your account data`}
        >
          <pre className="drawer-json" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {answer.answer}
          </pre>
        </Card>
      ) : null}
      <Card title="Read-only scope">
        <p className="hint">
          The API substitutes the verified account id for any identity filter produced by the model.
          The assistant can read only the entities enabled for the widget and cannot perform account
          actions.
        </p>
      </Card>
    </div>
  );
}
