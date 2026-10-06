"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Drawer } from "@/components/Drawer";
import { SectionState } from "@/components/section-state";
import { EmptyState, ErrorState, LoadingAnnouncement, Skeleton } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount, formatInstant } from "@/lib/format";
import { METADATA_CLAIMS_DETAIL } from "@/lib/users";
import type { AdminUser, AuditEvent } from "@/server/cryden/admin";
import type { UserDetail } from "@/server/users/browse";

/**
 * One account's detail, in the panel a list row opens.
 *
 * The reads are the console's own route, for the reason the list's are. What
 * arrives is two sections that fail independently, so the drawer shows the
 * account even when the metadata table was never wired on the deployment it is
 * reading.
 *
 * Nothing here writes. The actions that change an account (suspend, unlock,
 * force-disable MFA, revoke sessions) need API endpoints that do not exist yet,
 * and each will arrive behind a step-up grant; until then this panel is a read,
 * which is what the screen says it is.
 */
export function UserDrawer({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  return (
    <Drawer
      open={user !== null}
      onClose={onClose}
      title={user === null ? "" : user.email}
      subtitle={user === null ? undefined : <span className="mono">{user.id}</span>}
    >
      {/* Keyed by account, so opening a second row starts from that account's
          own state rather than showing the first one's while it loads. */}
      {user === null ? null : <AccountDetail key={user.id} userId={user.id} />}
    </Drawer>
  );
}

type Load =
  | { kind: "loading" }
  | { kind: "failed"; failure: ConsoleFailure }
  | { kind: "ok"; detail: UserDetail };

const CONSOLE_UNREACHABLE: ConsoleFailure = {
  message: "The console could not reach its own server, so this account was not read.",
  code: "console_unreachable",
};

const CONSOLE_MALFORMED: ConsoleFailure = {
  message: "The console answered with a shape this panel does not recognise.",
  code: "console_malformed",
};

function AccountDetail({ userId }: { userId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const inFlight = useRef<AbortController | null>(null);

  const read = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    let response: Response;
    try {
      response = await fetch(`/api/console/users/${encodeURIComponent(userId)}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) return;
      setLoad({ kind: "failed", failure: CONSOLE_UNREACHABLE });
      return;
    }

    const payload: unknown = await response.json().catch(() => null);
    if (controller.signal.aborted) return;

    if (!response.ok) {
      setLoad({ kind: "failed", failure: failureFrom(payload, response.status) });
      return;
    }

    const detail = dataFrom<UserDetail>(payload);
    if (detail === null) {
      setLoad({ kind: "failed", failure: CONSOLE_MALFORMED });
      return;
    }

    setLoad({ kind: "ok", detail });
  }, [userId]);

  useEffect(() => {
    void read();
    return () => inFlight.current?.abort();
  }, [read]);

  const retry = useCallback(() => {
    setLoad({ kind: "loading" });
    void read();
  }, [read]);

  if (load.kind === "loading") {
    return (
      <>
        <LoadingAnnouncement>Loading the account</LoadingAnnouncement>
        <Skeleton variant="row" />
        <Skeleton variant="row" />
        <Skeleton variant="row" />
      </>
    );
  }

  if (load.kind === "failed") {
    return (
      <ErrorState
        bare
        title="This account did not load"
        description={load.failure.message}
        code={load.failure.code ?? undefined}
        onRetry={retry}
      />
    );
  }

  const { detail, metadata } = load.detail;
  if (detail.state !== "ok") {
    return <SectionState section={detail} onRetry={retry} />;
  }

  const { user, active_sessions: sessions, recent_activity: activity } = detail.data;
  const keys = metadata.state === "ok" ? Object.keys(metadata.data.metadata) : [];

  return (
    <>
      <div className="drawer-title">Identity</div>
      <dl className="detail-list">
        <Row label="Account id">
          <span className="mono">{user.id}</span>
        </Row>
        <Row label="Email">{user.email}</Row>
        <Row label="Created">
          <span className="dim">{formatInstant(user.created_at)}</span>
        </Row>
        <Row label="Last change">
          <span className="dim">{formatInstant(user.updated_at)}</span>
        </Row>
        <Row label="Status">{user.locked ? "Locked" : "Active"}</Row>
        <Row label="Failed attempts">{formatCount(user.failed_attempts)}</Row>
        {user.locked_until === null ? null : (
          <Row label="Locked until">
            <span className="dim">{formatInstant(user.locked_until)}</span>
          </Row>
        )}
      </dl>

      <div className="drawer-title">Active sessions</div>
      <p className="hint">
        {formatCount(sessions)} {sessions === 1 ? "session is" : "sessions are"} live for this
        account right now. The API answers with a count rather than a list, so no address or client
        is published here.
      </p>

      <div className="drawer-title">Metadata</div>
      <p className="hint">{METADATA_CLAIMS_DETAIL}</p>
      {metadata.state !== "ok" ? (
        <SectionState section={metadata} onRetry={retry} />
      ) : keys.length === 0 ? (
        <EmptyState
          bare
          title="No metadata"
          description="This account carries no metadata, so its tokens are minted with its registered claims alone."
        />
      ) : (
        // Serialised rather than laid out in rows: metadata is arbitrary JSON
        // that feeds JWT claims, and a panel that guessed at its shape would
        // drop whatever did not fit the guess.
        <pre className="drawer-json">{JSON.stringify(metadata.data.metadata, null, 2)}</pre>
      )}
      {metadata.state === "ok" && metadata.data.reserved_claim_names.length > 0 ? (
        <p className="hint">
          Reserved keys, which the API refuses:{" "}
          <span className="mono">{metadata.data.reserved_claim_names.join(", ")}</span>.
        </p>
      ) : null}

      <div className="drawer-title">Recent activity</div>
      {activity.length === 0 ? (
        <EmptyState
          bare
          title="Nothing recorded"
          description="The API holds no recent events for this account. The window it reports over is the API's own."
        />
      ) : (
        <div>
          {activity.map((event) => (
            <ActivityRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </>
  );
}

/** One `dt`/`dd` pair, so the list above reads as data rather than as layout. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * One recorded event.
 *
 * The type and the metadata are the engine's own strings, printed as text. They
 * are not in this console's vocabulary and are not translated into it: an event
 * this screen has never heard of is exactly the event an operator is looking
 * for, and a panel that renamed it to something familiar would hide it.
 */
function ActivityRow({ event }: { event: AuditEvent }) {
  const metadata = event.metadata ?? {};
  const entries = Object.entries(metadata);

  return (
    <div className="activity-row">
      <div className="activity-head">
        <span className="audit-event">{event.type}</span>
        <span className="activity-when">{formatInstant(event.created_at)}</span>
      </div>
      {event.ip === undefined && entries.length === 0 ? null : (
        <div className="activity-meta">
          {[
            ...(event.ip === undefined ? [] : [`ip=${event.ip}`]),
            ...entries.map(([key, value]) => `${key}=${value}`),
          ].join("  ")}
        </div>
      )}
    </div>
  );
}
