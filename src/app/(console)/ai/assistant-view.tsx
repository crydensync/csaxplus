"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { ErrorState } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount } from "@/lib/format";
import type { AdminAIAnswer, AdminAIQuery, AskAIAnswer } from "@/server/cryden/admin";

export function AssistantView({ csrf }: { csrf: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskAIAnswer | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<
    "account" | "admin" | "logs" | "anomalies" | "audit" | "composed"
  >("account");
  const [adminQuestion, setAdminQuestion] = useState("");
  const [adminResult, setAdminResult] = useState<AdminAIQuery | null>(null);
  const [adminFailure, setAdminFailure] = useState<ConsoleFailure | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [toolQuestion, setToolQuestion] = useState("");
  const [toolAnswer, setToolAnswer] = useState<AdminAIAnswer | null>(null);
  const [toolQuery, setToolQuery] = useState<AdminAIQuery | null>(null);
  const [toolFailure, setToolFailure] = useState<ConsoleFailure | null>(null);
  const [toolLoading, setToolLoading] = useState(false);
  const [since, setSince] = useState<"1h" | "24h" | "7d" | "30d">("24h");

  const runAdminTool = async (event: FormEvent<HTMLFormElement> | undefined) => {
    event?.preventDefault();
    setToolAnswer(null);
    setToolQuery(null);
    setToolFailure(null);
    setToolLoading(true);
    const endpoint =
      mode === "logs"
        ? "logs"
        : mode === "anomalies"
          ? "anomalies-scan"
          : mode === "audit"
            ? "audit"
            : "ask";
    const body =
      mode === "logs" ? {} : mode === "anomalies" ? { since } : { question: toolQuestion };
    try {
      const response = await fetch(`/api/console/ai/${endpoint}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setToolFailure(failureFrom(payload, response.status));
        return;
      }
      const data = dataFrom<AdminAIAnswer | AdminAIQuery>(payload);
      if (data === null || typeof data !== "object") {
        setToolFailure({
          message: "The API returned a response this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      if (mode === "audit") {
        if (
          !("entity" in data) ||
          data.entity !== "audit_events" ||
          !Array.isArray(data.columns) ||
          !Array.isArray(data.rows)
        ) {
          setToolFailure({
            message: "The API returned a response this screen does not recognise.",
            code: "console_malformed",
          });
          return;
        }
        setToolQuery(data as AdminAIQuery);
      } else {
        if (
          !("answer" in data) ||
          typeof data.answer !== "string" ||
          typeof data.source_entity !== "string" ||
          typeof data.row_count !== "number"
        ) {
          setToolFailure({
            message: "The API returned a response this screen does not recognise.",
            code: "console_malformed",
          });
          return;
        }
        setToolAnswer(data as AdminAIAnswer);
      }
    } catch {
      setToolFailure({
        message: "The console could not reach its server.",
        code: "console_unreachable",
      });
    } finally {
      setToolLoading(false);
    }
  };

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
        <Button variant={mode === "logs" ? "primary" : undefined} onClick={() => setMode("logs")}>
          Log summary
        </Button>
        <Button
          variant={mode === "anomalies" ? "primary" : undefined}
          onClick={() => setMode("anomalies")}
        >
          Anomaly scan
        </Button>
        <Button variant={mode === "audit" ? "primary" : undefined} onClick={() => setMode("audit")}>
          Audit query
        </Button>
        <Button
          variant={mode === "composed" ? "primary" : undefined}
          onClick={() => setMode("composed")}
        >
          Ask admin AI
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
      ) : mode === "admin" ? (
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
      ) : (
        <>
          <Card
            title={
              mode === "logs"
                ? "Summarize recent shipped logs"
                : mode === "anomalies"
                  ? "Scan flagged authentication events"
                  : mode === "audit"
                    ? "Query audit events"
                    : "Ask about admin data"
            }
            hint="Read-only. CSAG uses bounded, redacted or allowlisted data and returns its source citation."
          >
            <form onSubmit={(event) => void runAdminTool(event)}>
              {mode === "anomalies" ? (
                <label className="field-label" htmlFor="ai-anomaly-window">
                  Time window
                  <select
                    id="ai-anomaly-window"
                    className="text-input"
                    value={since}
                    onChange={(event) => setSince(event.target.value as typeof since)}
                  >
                    <option value="1h">Last hour</option>
                    <option value="24h">Last 24 hours</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                  </select>
                </label>
              ) : null}
              {mode === "audit" || mode === "composed" ? (
                <label className="field-label" htmlFor="ai-admin-tool-question">
                  Question
                  <textarea
                    id="ai-admin-tool-question"
                    className="text-input"
                    rows={4}
                    maxLength={500}
                    value={toolQuestion}
                    onChange={(event) => setToolQuestion(event.target.value)}
                    placeholder={
                      mode === "audit"
                        ? "For example: show recent account suspension events"
                        : "For example: which accounts had repeated login failures?"
                    }
                  />
                </label>
              ) : null}
              <div className="row-between" style={{ marginTop: 8, gap: 12, flexWrap: "wrap" }}>
                <span className="hint">
                  {mode === "logs"
                    ? "Uses the latest 50 redacted shipped log entries."
                    : mode === "anomalies"
                      ? "Scans at most 50 flagged events in the selected window."
                      : "Questions are limited to 500 characters."}
                </span>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={
                    toolLoading ||
                    ((mode === "audit" || mode === "composed") && !toolQuestion.trim())
                  }
                >
                  {toolLoading
                    ? "Working…"
                    : mode === "logs"
                      ? "Summarize logs"
                      : mode === "anomalies"
                        ? "Scan events"
                        : mode === "audit"
                          ? "Query audit"
                          : "Ask"}
                </Button>
              </div>
            </form>
          </Card>
          {toolFailure ? (
            <Card>
              <ErrorState
                title="The AI request could not run"
                description={
                  toolFailure.code === "not_configured"
                    ? "AI analysis needs an LLM provider and a separately configured, verified read-only PostgreSQL provider. The widget enabled/origin settings do not configure its data source. Check Database Provider and LLM Provider settings."
                    : toolFailure.message
                }
                code={toolFailure.code ?? undefined}
              />
              {toolFailure.code === "not_configured" ? (
                <p className="hint" style={{ marginTop: 12 }}>
                  <Link href="/database-provider">Open Database Provider settings</Link>
                </p>
              ) : null}
            </Card>
          ) : null}
          {toolAnswer ? (
            <Card
              title="AI summary"
              hint={`${formatCount(toolAnswer.row_count)} rows from ${toolAnswer.source_entity}${toolAnswer.since ? ` · ${toolAnswer.since}` : ""}`}
            >
              <Pill tone="neutral">
                Source: {toolAnswer.source_entity} · {toolAnswer.row_count} rows
              </Pill>
              <pre
                className="drawer-json"
                style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
              >
                {toolAnswer.answer}
              </pre>
            </Card>
          ) : null}
          {toolQuery ? (
            <Card
              title="Audit query result"
              hint={`${formatCount(toolQuery.row_count)} rows from audit_events`}
            >
              <Pill tone="neutral">Source: audit_events</Pill>
              <DataTable
                caption="Read-only audit event query results"
                columns={[
                  { key: "row", header: "#", cell: (item) => item.row },
                  ...toolQuery.columns.map((column) => ({
                    key: column,
                    header: column,
                    cell: (item: Record<string, string>) => item[column] ?? "",
                  })),
                ]}
                rows={toolQuery.rows.map((cells, index) => ({
                  row: String(index + 1),
                  ...Object.fromEntries(
                    toolQuery.columns.map((column, columnIndex) => [
                      column,
                      cells[columnIndex] ?? "",
                    ]),
                  ),
                }))}
                rowKey={(item) => item.row}
                minWidthPx={600}
                emptyState={<span className="hint">No rows matched this query.</span>}
              />
            </Card>
          ) : null}
        </>
      )}
      {mode === "account" && failure ? (
        <Card>
          <ErrorState
            title="The assistant could not answer"
            description={
              failure.code === "not_configured"
                ? "This feature needs an LLM provider and a separately configured, verified read-only PostgreSQL provider. The widget enabled/origin settings do not configure its data source. Check Database Provider and LLM Provider settings."
                : failure.message
            }
            code={failure.code ?? undefined}
          />
          {failure.code === "not_configured" ? (
            <p className="hint" style={{ marginTop: 12 }}>
              <Link href="/database-provider">Open Database Provider settings</Link>
            </p>
          ) : null}
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
