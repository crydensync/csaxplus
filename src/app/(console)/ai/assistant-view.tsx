"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { ErrorState } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount } from "@/lib/format";
import type { AdminAIQuery, AskAIAnswer } from "@/server/cryden/admin";

export function AssistantView({ csrf }: { csrf: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskAIAnswer | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"account" | "admin">("account");
  const [adminQuestion, setAdminQuestion] = useState("");
  const [adminResult, setAdminResult] = useState<AdminAIQuery | null>(null);
  const [adminFailure, setAdminFailure] = useState<ConsoleFailure | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

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

  const submitAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAdminResult(null);
    setAdminFailure(null);
    setAdminLoading(true);
    try {
      const response = await fetch("/api/console/ai/admin-query", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({ question: adminQuestion }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setAdminFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<AdminAIQuery>(payload);
      if (
        result === null ||
        typeof result.entity !== "string" ||
        !Array.isArray(result.columns) ||
        !Array.isArray(result.rows)
      ) {
        setAdminFailure({
          message: "The API returned a query result this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setAdminResult(result);
    } catch {
      setAdminFailure({
        message: "The console could not reach its server.",
        code: "console_unreachable",
      });
    } finally {
      setAdminLoading(false);
    }
  };

  const adminRows =
    adminResult?.rows.map((cells, index) => ({
      row: String(index + 1),
      ...Object.fromEntries(
        adminResult.columns.map((column, columnIndex) => [column, cells[columnIndex] ?? ""]),
      ),
    })) ?? [];
  const adminColumns: Column<Record<string, string>>[] = adminResult
    ? [
        { key: "row", header: "#", cell: (item) => item.row },
        ...adminResult.columns.map((column) => ({
          key: column,
          header: column,
          cell: (item: Record<string, string>) => item[column] ?? "",
        })),
      ]
    : [];

  return (
    <div className="view anim ai-assistant-view">
      <div className="actions-row">
        <Button
          variant={mode === "account" ? "primary" : undefined}
          onClick={() => setMode("account")}
        >
          My account
        </Button>
        <Button variant={mode === "admin" ? "primary" : undefined} onClick={() => setMode("admin")}>
          Admin query
        </Button>
      </div>
      {mode === "account" ? (
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
      ) : (
        <>
          <Card
            title="Read-only admin query"
            hint="Ask about users, sessions, or audit events. CSAG converts the question to an allowlisted query and runs it using the configured read-only database role."
          >
            <form onSubmit={(event) => void submitAdmin(event)}>
              <label className="field-label" htmlFor="admin-ai-question">
                Question
              </label>
              <textarea
                id="admin-ai-question"
                className="text-input"
                rows={4}
                maxLength={500}
                value={adminQuestion}
                onChange={(event) => setAdminQuestion(event.target.value)}
                placeholder="For example: count users with locked accounts"
              />
              <div className="row-between" style={{ marginTop: 8, gap: 12, flexWrap: "wrap" }}>
                <span className="hint">
                  {adminQuestion.length}/500 characters. Results are limited by CSAG&apos;s safe
                  query allowlist.
                </span>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={adminLoading || !adminQuestion.trim()}
                >
                  {adminLoading ? "Querying…" : "Run query"}
                </Button>
              </div>
            </form>
          </Card>
          {adminFailure ? (
            <Card>
              <ErrorState
                title="The admin query could not run"
                description={adminFailure.message}
                code={adminFailure.code ?? undefined}
              />
            </Card>
          ) : null}
          {adminResult ? (
            <Card
              title="Query result"
              hint={`${formatCount(adminResult.row_count)} rows from ${adminResult.entity}`}
            >
              <Pill tone="neutral">Source: {adminResult.entity}</Pill>
              <DataTable
                caption={`Read-only ${adminResult.entity} query results`}
                columns={adminColumns}
                rows={adminRows}
                rowKey={(item) => item.row}
                minWidthPx={600}
                emptyState={<span className="hint">No rows matched this query.</span>}
              />
            </Card>
          ) : null}
          <Card title="Read-only guarantee">
            <p className="hint">
              The model cannot submit SQL. CSAG validates every entity, field, operator, and result
              limit, then executes through the configured read-only database connection.
            </p>
          </Card>
        </>
      )}
      {mode === "account" && failure ? (
        <Card>
          <ErrorState
            title="The assistant could not answer"
            description={failure.message}
            code={failure.code ?? undefined}
          />
        </Card>
      ) : null}
      {mode === "account" && answer ? (
        <Card
          title="Answer"
          hint={`${formatCount(answer.row_count)} rows returned from your account data`}
        >
          <pre className="drawer-json" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {answer.answer}
          </pre>
        </Card>
      ) : null}
      {mode === "account" ? (
        <Card title="Read-only scope">
          <p className="hint">
            The API substitutes the verified account id for any identity filter produced by the
            model. The assistant can read only the entities enabled for the widget and cannot
            perform account actions.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
