"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { EmptyState, ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount, formatInstant } from "@/lib/format";
import type { AdminOperator, AdminOperators } from "@/server/cryden/admin";
import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { CSRF_HEADER } from "@/lib/csrf-header";

function isRoster(value: unknown): value is AdminOperators {
  if (
    typeof value !== "object" ||
    value === null ||
    !("operators" in value) ||
    !("total" in value)
  ) {
    return false;
  }
  const roster = value as { operators: unknown; total: unknown };
  return (
    typeof roster.total === "number" &&
    Number.isInteger(roster.total) &&
    roster.total >= 0 &&
    Array.isArray(roster.operators) &&
    roster.operators.every((operator: unknown) => {
      if (typeof operator !== "object" || operator === null) return false;
      const item = operator as Record<string, unknown>;
      return (
        typeof item.user_id === "string" &&
        typeof item.email === "string" &&
        typeof item.role === "string" &&
        ["owner", "admin", "viewer"].includes(item.role) &&
        typeof item.created_at === "string"
      );
    })
  );
}

export function OperatorsView({ owner, csrf }: { owner: boolean; csrf: string }) {
  const [roster, setRoster] = useState<AdminOperators | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const read = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch("/api/console/operators", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const data = dataFrom<AdminOperators>(payload);
      if (data === null || !isRoster(data)) {
        setFailure({
          message: "The API returned an operator roster this screen does not recognise.",
          code: "api_malformed",
        });
        return;
      }
      setRoster(data);
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

  const mutate = useCallback(
    async (
      operator: AdminOperator,
      purpose: "operator_role_change" | "operator_remove",
      role?: AdminOperator["role"],
    ) => {
      setBusy(operator.user_id);
      setFailure(null);
      try {
        const begin = await fetch("/api/console/operators/step-up/begin", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
          body: JSON.stringify({ purpose }),
        });
        const beginPayload: unknown = await begin.json().catch(() => null);
        if (!begin.ok) throw new Error(failureFrom(beginPayload, begin.status).message);
        const beginData = dataFrom<{ public_key: PublicKeyCredentialRequestOptionsJSON }>(
          beginPayload,
        );
        if (!beginData) throw new Error("CSAG returned invalid passkey options.");
        const credential = await startAuthentication({ optionsJSON: beginData.public_key });
        const finish = await fetch("/api/console/operators/step-up/finish", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
          body: JSON.stringify({ purpose, credential }),
        });
        const finishPayload: unknown = await finish.json().catch(() => null);
        if (!finish.ok) throw new Error(failureFrom(finishPayload, finish.status).message);
        const response = await fetch(
          `/api/console/operators/${encodeURIComponent(operator.user_id)}`,
          {
            method: purpose === "operator_remove" ? "DELETE" : "PUT",
            credentials: "same-origin",
            headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
            body: purpose === "operator_role_change" ? JSON.stringify({ role }) : undefined,
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
        await read();
      } catch (error) {
        setFailure({
          message: error instanceof Error ? error.message : "The operator action failed.",
          code: "operator_action_failed",
        });
      } finally {
        setBusy(null);
      }
    },
    [csrf, read],
  );

  const columns = useMemo<Column<AdminOperator>[]>(
    () => [
      {
        key: "operator",
        header: "Operator",
        cell: (operator) => (
          <>
            <b>{operator.email}</b>
            <div className="hint mono">{operator.user_id}</div>
          </>
        ),
      },
      {
        key: "role",
        header: "Role",
        cell: (operator) => (
          <Pill tone={operator.role === "owner" ? "amber" : "neutral"}>{operator.role}</Pill>
        ),
      },
      { key: "created", header: "Added", cell: (operator) => formatInstant(operator.created_at) },
      ...(owner
        ? [
            {
              key: "actions",
              header: "Access",
              cell: (operator: AdminOperator) => (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select
                    aria-label={`Change ${operator.email} role`}
                    value={operator.role}
                    disabled={busy === operator.user_id}
                    onChange={(event) =>
                      void mutate(
                        operator,
                        "operator_role_change",
                        event.target.value as AdminOperator["role"],
                      )
                    }
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <Button
                    disabled={busy === operator.user_id}
                    onClick={() => {
                      if (window.confirm(`Remove ${operator.email} from console operators?`))
                        void mutate(operator, "operator_remove");
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ),
            } as Column<AdminOperator>,
          ]
        : []),
    ],
    [busy, mutate, owner],
  );

  if (loading && roster === null) {
    return (
      <div className="view anim">
        <LoadingAnnouncement>Loading operators</LoadingAnnouncement>
      </div>
    );
  }
  if (failure !== null && roster === null) {
    return (
      <div className="view anim">
        <Card>
          <ErrorState
            title="Operators did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read()}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="view anim">
      <Card
        title="Console operators"
        hint="Roles are read from CSAG on each request."
        action={
          <Button onClick={() => void read()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      >
        {failure !== null ? (
          <p className="error-text" role="status">
            Refresh failed: {failure.message}
          </p>
        ) : null}
        <p className="hint" style={{ margin: "12px 0 16px" }}>
          {roster ? `${formatCount(roster.total)} operators` : ""}. Role changes and removal require
          a fresh passkey confirmation. Invitations, passkey controls and operator session details
          are not enabled yet.
        </p>
        <DataTable
          caption="Console operators"
          columns={columns}
          rows={roster?.operators ?? []}
          rowKey={(operator) => operator.user_id}
          loading={loading}
          emptyState={
            <EmptyState
              title="No operators found"
              description="The API has no operator entries to show."
            />
          }
        />
      </Card>
    </div>
  );
}
