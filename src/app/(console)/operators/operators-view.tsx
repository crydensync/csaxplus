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

export function OperatorsView() {
  const [roster, setRoster] = useState<AdminOperators | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);

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
    ],
    [],
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
          {roster ? `${formatCount(roster.total)} operators` : ""}. Invitations, role changes,
          removal, passkey controls and operator session details are not enabled yet. CSAG has no
          invitation sender or scoped session/passkey admin routes. Role changes and removal also
          need API-enforced step-up authentication.
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
