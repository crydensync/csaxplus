"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount, formatInstant } from "@/lib/format";
import type {
  APIDatabaseCatalog,
  APIDatabaseRows,
  APIMigrationStatus,
} from "@/server/cryden/admin";
import type { ConsoleMigrationReport } from "@/server/database/migrations";

type DatabaseReport = {
  api_migrations: APIMigrationStatus;
  catalog: APIDatabaseCatalog;
  console_migrations: ConsoleMigrationReport;
};

export function DatabaseView() {
  const [report, setReport] = useState<DatabaseReport | null>(null);
  const [tableRows, setTableRows] = useState<APIDatabaseRows | null>(null);
  const [selectedTable, setSelectedTable] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [rowsFailure, setRowsFailure] = useState<ConsoleFailure | null>(null);

  const readRows = useCallback(async (table: string, nextOffset: number) => {
    setRowsLoading(true);
    setRowsFailure(null);
    try {
      const params = new URLSearchParams({ limit: "25", offset: String(nextOffset) });
      const response = await fetch(
        `/api/console/database/tables/${encodeURIComponent(table)}?${params}`,
        { credentials: "same-origin", headers: { accept: "application/json" } },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setRowsFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<APIDatabaseRows>(payload);
      if (
        result === null ||
        result.table !== table ||
        !Array.isArray(result.columns) ||
        !Array.isArray(result.rows)
      ) {
        setRowsFailure({
          message: "The API returned table data this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setTableRows(result);
      setOffset(nextOffset);
    } catch {
      setRowsFailure({
        message: "The console could not reach its server.",
        code: "console_unreachable",
      });
    } finally {
      setRowsLoading(false);
    }
  }, []);

  const read = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch("/api/console/database", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<unknown>(payload);
      if (result === null || !isDatabaseReport(result)) {
        setFailure({
          message: "The API returned database information this screen does not recognise.",
          code: "console_malformed",
        });
        return;
      }
      setReport(result);
      const firstReadable = result.catalog.tables.find((table) =>
        table.columns.some((column) => column.readable),
      );
      const nextTable = result.catalog.tables
        .find((table) => table.name === "users")
        ?.columns.some((column) => column.readable)
        ? "users"
        : (firstReadable?.name ?? "");
      setSelectedTable(nextTable);
      if (nextTable) await readRows(nextTable, 0);
    } catch {
      setFailure({
        message: "The console could not reach its server.",
        code: "console_unreachable",
      });
    } finally {
      setLoading(false);
    }
  }, [readRows]);

  useEffect(() => {
    void read();
  }, [read]);

  const selected = report?.catalog.tables.find((table) => table.name === selectedTable);
  const readableColumns = selected?.columns.filter((column) => column.readable) ?? [];
  const columns = useMemo<Column<Record<string, unknown>>[]>(
    () =>
      (tableRows?.columns ?? []).map((name) => ({
        key: name,
        header: name,
        cell: (row) => <Cell value={row[name]} />,
      })),
    [tableRows?.columns],
  );

  if (loading && report === null) {
    return (
      <div className="view anim spaced-view">
        <LoadingAnnouncement>Loading database schema and migrations</LoadingAnnouncement>
      </div>
    );
  }
  if (failure !== null && report === null) {
    return (
      <div className="view anim spaced-view">
        <Card>
          <ErrorState
            title="Database information did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read()}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="view anim spaced-view">
      {failure ? (
        <Card>
          <ErrorState
            title="Refresh failed"
            description={failure.message}
            code={failure.code ?? undefined}
          />
        </Card>
      ) : null}
      {report ? (
        <>
          <Card
            title="CSAG auth database migrations"
            hint={`Migration tracker in ${report.api_migrations.schema}. This reports the API build’s expected migrations and the active database state.`}
            action={
              <Pill tone={report.api_migrations.pending.length ? "amber" : "green"}>
                {report.api_migrations.pending.length ? "Pending" : "Up to date"}
              </Pill>
            }
          >
            <MigrationList
              applied={report.api_migrations.applied.map((item) => ({
                id: item.name,
                name: item.name,
                at: item.applied_at,
              }))}
              pending={report.api_migrations.pending.map((name) => ({ id: name, name }))}
            />
          </Card>
          <Card
            title="CSAX+ console-store migrations"
            hint={`Separate console database (${report.console_migrations.dialect}). These migrations do not modify CSAG’s auth schema.`}
            action={
              <Pill tone={report.console_migrations.pending.length ? "amber" : "green"}>
                {report.console_migrations.initialized ? "Initialized" : "Not initialized"}
              </Pill>
            }
          >
            <MigrationList
              applied={report.console_migrations.applied.map((item) => ({
                id: item.id,
                name: item.name,
                at: item.applied_at,
              }))}
              pending={report.console_migrations.pending}
            />
          </Card>
          <Card
            title="Auth-schema tables"
            hint="Browse at most 25 rows at a time. Only reviewed, non-sensitive columns are returned; credential hashes, secret material, and opaque payloads stay hidden."
          >
            <div className="row-between" style={{ gap: 12, flexWrap: "wrap" }}>
              <label className="field-label" style={{ minWidth: 240 }}>
                Table
                <select
                  className="text-input"
                  value={selectedTable}
                  onChange={(event) => {
                    const table = event.target.value;
                    setSelectedTable(table);
                    setTableRows(null);
                    void readRows(table, 0);
                  }}
                >
                  {report.catalog.tables.map((table) => {
                    const canRead = table.columns.some((column) => column.readable);
                    return (
                      <option key={table.name} value={table.name} disabled={!canRead}>
                        {table.name}
                        {canRead ? "" : " · metadata only"}
                      </option>
                    );
                  })}
                </select>
              </label>
              <div className="actions-row">
                <span className="hint">
                  {formatCount(report.catalog.tables.length)} tables ·{" "}
                  {formatCount(readableColumns.length)} visible columns
                </span>
                <Button onClick={() => void read()} disabled={loading}>
                  {loading ? "Refreshing…" : "Refresh"}
                </Button>
              </div>
            </div>
            {selected ? (
              <p className="hint" style={{ marginTop: 10 }}>
                {selected.columns.length - readableColumns.length} protected or unreviewed columns
                are omitted from row previews.
              </p>
            ) : null}
            {rowsFailure ? (
              <div style={{ marginTop: 14 }}>
                <ErrorState
                  title="Table rows did not load"
                  description={rowsFailure.message}
                  code={rowsFailure.code ?? undefined}
                />
              </div>
            ) : null}
            {tableRows ? (
              <>
                <DataTable
                  caption={`Read-only ${tableRows.table} rows`}
                  columns={columns}
                  rows={tableRows.rows}
                  rowKey={(row) => String(row.id ?? row.user_id ?? row.name ?? JSON.stringify(row))}
                  loading={rowsLoading}
                  minWidthPx={Math.max(600, columns.length * 140)}
                  emptyState={<p className="hint">This table has no rows.</p>}
                />
                <div className="row-between" style={{ marginTop: 14, gap: 12, flexWrap: "wrap" }}>
                  <span className="hint">
                    {formatCount(tableRows.total)} rows · showing{" "}
                    {tableRows.total === 0 ? 0 : offset + 1} to
                    {Math.min(offset + tableRows.rows.length, tableRows.total)}
                  </span>
                  <div className="actions-row">
                    <Button
                      onClick={() =>
                        void readRows(selectedTable, Math.max(0, offset - tableRows.limit))
                      }
                      disabled={rowsLoading || offset === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      onClick={() => void readRows(selectedTable, offset + tableRows.limit)}
                      disabled={rowsLoading || offset + tableRows.limit >= tableRows.total}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function MigrationList({
  applied,
  pending,
}: {
  applied: { id: string; name: string; at?: string }[];
  pending: { id: string; name: string }[];
}) {
  return (
    <dl className="detail-list" style={{ marginTop: 12 }}>
      <div className="detail-row">
        <dt>Applied</dt>
        <dd>{formatCount(applied.length)}</dd>
      </div>
      <div className="detail-row">
        <dt>Pending</dt>
        <dd>{formatCount(pending.length)}</dd>
      </div>
      {applied
        .slice()
        .reverse()
        .map((item) => (
          <div className="detail-row" key={item.id}>
            <dt className="mono">{item.name}</dt>
            <dd>{item.at ? formatInstant(item.at) : <Pill tone="green">Applied</Pill>}</dd>
          </div>
        ))}
      {pending.map((item) => (
        <div className="detail-row" key={item.id}>
          <dt className="mono">{item.name}</dt>
          <dd>
            <Pill tone="amber">Pending</Pill>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="hint">NULL</span>;
  if (typeof value === "object") return <span className="mono">{JSON.stringify(value)}</span>;
  return <span className="mono">{String(value)}</span>;
}

function isDatabaseReport(value: unknown): value is DatabaseReport {
  if (
    !isRecord(value) ||
    !isRecord(value.api_migrations) ||
    !isRecord(value.catalog) ||
    !isRecord(value.console_migrations)
  )
    return false;
  return (
    Array.isArray(value.api_migrations.applied) &&
    Array.isArray(value.api_migrations.pending) &&
    Array.isArray(value.catalog.tables) &&
    value.catalog.tables.every(
      (table) => isRecord(table) && typeof table.name === "string" && Array.isArray(table.columns),
    ) &&
    Array.isArray(value.console_migrations.applied) &&
    Array.isArray(value.console_migrations.pending)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
