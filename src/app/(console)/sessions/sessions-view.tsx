"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatInstant, formatCount } from "@/lib/format";
import { CSRF_HEADER } from "@/lib/csrf-header";
import type { AdminSession, AdminSessions } from "@/server/cryden/admin";

const PAGE_SIZE = 25;

export function SessionsView({ csrf }: { csrf: string }) {
  const router = useRouter();
  const [page, setPage] = useState<AdminSessions | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [target, setTarget] = useState<AdminSession | "all" | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const read = useCallback(async (nextOffset: number) => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch(
        `/api/console/sessions?limit=${PAGE_SIZE}&offset=${nextOffset}`,
        {
          credentials: "same-origin",
          headers: { accept: "application/json" },
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const data = dataFrom<AdminSessions>(payload);
      if (data === null || !isAdminSessions(data)) {
        setFailure({
          message: "The API returned a session list this screen does not recognise.",
          code: "api_malformed",
        });
        return;
      }
      setPage(data);
      setOffset(nextOffset);
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
    void read(0);
  }, [read]); // The screen starts on the newest sessions.

  const act = useCallback(async () => {
    if (target === null) return;
    setRunning(true);
    setNotice(null);
    try {
      const all = target === "all";
      const response = await fetch(
        all ? "/api/console/sessions" : `/api/console/sessions/${encodeURIComponent(target.id)}`,
        {
          method: all ? "POST" : "DELETE",
          credentials: "same-origin",
          headers: { accept: "application/json", [CSRF_HEADER]: csrf },
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      if (all) {
        router.replace("/login");
        router.refresh();
        return;
      }
      setTarget(null);
      setNotice(all ? "All active sessions were revoked." : "Session revoked.");
      await read(0);
    } catch {
      setFailure({
        message: "The console could not reach its server. No session was revoked.",
        code: "console_unreachable",
      });
    } finally {
      setRunning(false);
    }
  }, [csrf, read, router, target]);

  const columns = useMemo<Column<AdminSession>[]>(
    () => [
      {
        key: "account",
        header: "Account",
        cell: (session) => (
          <>
            <b>{session.email}</b>
            <div className="hint mono">{session.user_id}</div>
          </>
        ),
      },
      {
        key: "device",
        header: "Device",
        cell: (session) => (
          <>
            <b>{session.device}</b>
            <div className="hint">{session.user_agent || "No user agent"}</div>
          </>
        ),
      },
      { key: "ip", header: "IP address", cell: (session) => session.ip || "Unknown" },
      { key: "created", header: "Started", cell: (session) => formatInstant(session.created_at) },
      {
        key: "action",
        header: "",
        align: "right",
        cell: (session) => (
          <Button size="small" variant="danger-ghost" onClick={() => setTarget(session)}>
            Revoke
          </Button>
        ),
      },
    ],
    [],
  );

  if (loading && page === null) {
    return (
      <div className="view anim">
        <LoadingAnnouncement>Loading active sessions</LoadingAnnouncement>
      </div>
    );
  }
  if (failure !== null && page === null) {
    return (
      <div className="view anim">
        <Card>
          <ErrorState
            title="Sessions did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read(0)}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="view anim">
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div className="hint">{page ? `${formatCount(page.total)} active sessions` : ""}</div>
        <div className="actions-row">
          <Button
            variant="danger-ghost"
            disabled={!page || page.total === 0}
            onClick={() => setTarget("all")}
          >
            Revoke all sessions
          </Button>
          <Button onClick={() => void read(offset)} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>
      {failure ? (
        <Card>
          <ErrorState
            title="Sessions could not refresh"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read(offset)}
          />
        </Card>
      ) : null}
      {notice ? (
        <p role="status" className="hint" style={{ marginBottom: 12 }}>
          {notice}
        </p>
      ) : null}
      <DataTable
        caption="Active sessions across all accounts"
        columns={columns}
        rows={page?.sessions ?? []}
        rowKey={(session) => session.id}
        loading={loading}
        emptyState={
          <Card title="No active sessions">
            <p className="hint">There are no active sessions on this deployment.</p>
          </Card>
        }
        minWidthPx={900}
      />
      {page && page.total > PAGE_SIZE ? (
        <div className="row-between" style={{ marginTop: 16 }}>
          <span className="hint">
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, page.total)} of {page.total}
          </span>
          <div className="actions-row">
            <Button
              disabled={offset === 0 || loading}
              onClick={() => void read(Math.max(0, offset - PAGE_SIZE))}
            >
              Previous
            </Button>
            <Button
              disabled={offset + PAGE_SIZE >= page.total || loading}
              onClick={() => void read(offset + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
      <p className="hint" style={{ marginTop: 16 }}>
        Revoking all sessions signs out every account, including your own, and will require users to
        sign in again.
      </p>
      {target !== null ? (
        <Modal
          open
          onClose={() => setTarget(null)}
          title={
            target === "all" ? "Revoke every active session?" : `Revoke ${target.email}'s session?`
          }
          description={
            target === "all"
              ? "Every user on this deployment, including you, will be signed out. This action is recorded in the audit log."
              : `This signs ${target.email} out of this device. The action is recorded in the audit log.`
          }
          actions={
            <div className="actions-row">
              <Button variant="danger-ghost" disabled={running} onClick={() => void act()}>
                {running ? "Revoking…" : target === "all" ? "Revoke all" : "Revoke session"}
              </Button>
            </div>
          }
        />
      ) : null}
    </div>
  );
}

function isAdminSessions(value: AdminSessions): boolean {
  return (
    Number.isInteger(value.total) &&
    Array.isArray(value.sessions) &&
    value.sessions.every(
      (session) => typeof session.id === "string" && typeof session.email === "string",
    )
  );
}
