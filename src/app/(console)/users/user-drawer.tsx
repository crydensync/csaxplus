"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Drawer } from "@/components/Drawer";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionState } from "@/components/section-state";
import { EmptyState, ErrorState, LoadingAnnouncement, Skeleton } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount, formatInstant } from "@/lib/format";
import { METADATA_CLAIMS_DETAIL } from "@/lib/users";
import { auditEventTone } from "@/lib/audit-events";
import type { AdminUser, AuditEvent } from "@/server/cryden/admin";
import type { UserMetadata } from "@/server/cryden/admin";
import type { UserDetail } from "@/server/users/browse";

import { AccountActions } from "./account-actions";

/**
 * One account's detail, in the panel a list row opens.
 *
 * The reads are the console's own route, for the reason the list's are. What
 * arrives is two sections that fail independently, so the drawer shows the
 * account even when the metadata table was never wired on the deployment it is
 * reading.
 *
 * The actions live in `account-actions.tsx` and write through the console's own
 * routes; this panel re-renders from the account each answer carries rather
 * than re-reading, so an action's result and the screen agree without a second
 * round trip.
 */
export function UserDrawer({
  user,
  csrf,
  onClose,
}: {
  user: AdminUser | null;
  csrf: string;
  onClose: () => void;
}) {
  // The drawer's own copy of the account. It starts as the row that was
  // clicked and is replaced by the answer whenever an action lands, so a
  // suspend re-renders the status pill without a second GET. Keyed by account
  // id in the parent, so opening a second row starts from that row's state.
  const [shown, setShown] = useState<AdminUser | null>(user);
  useEffect(() => setShown(user), [user]);

  return (
    <Drawer
      open={user !== null}
      onClose={onClose}
      title={shown === null ? "" : shown.email}
      subtitle={shown === null ? undefined : <span className="mono">{shown.id}</span>}
    >
      {shown === null ? null : (
        <AccountDetail
          key={shown.id}
          userId={shown.id}
          account={shown}
          csrf={csrf}
          onAction={setShown}
        />
      )}
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

function AccountDetail({
  userId,
  account,
  csrf,
  onAction,
}: {
  userId: string;
  account: AdminUser;
  csrf: string;
  onAction: (user: AdminUser) => void;
}) {
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

  // The identity block renders from the drawer's copy of the account, which an
  // action's answer replaces; the detail read's own user field is the account
  // as the GET saw it and is not rendered again after that. The session count
  // and the activity are the read's, because an action's answer carries neither.
  const { active_sessions: sessions, recent_activity: activity } = detail.data;

  return (
    <>
      <div className="drawer-title">Actions</div>
      <AccountActions user={account} csrf={csrf} onAction={onAction} />

      <div className="drawer-title">Identity</div>
      <dl className="detail-list">
        <Row label="Account id">
          <span className="mono">{account.id}</span>
        </Row>
        <Row label="Email">{account.email}</Row>
        <Row label="Created">
          <span className="dim">{formatInstant(account.created_at)}</span>
        </Row>
        <Row label="Last change">
          <span className="dim">{formatInstant(account.updated_at)}</span>
        </Row>
        <Row label="Status">{account.locked ? "Locked" : "Active"}</Row>
        <Row label="Failed attempts">{formatCount(account.failed_attempts)}</Row>
        {account.locked_until === null ? null : (
          <Row label="Locked until">
            <span className="dim">{formatInstant(account.locked_until)}</span>
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
      ) : (
        <MetadataClaimsEditor
          userId={userId}
          email={account.email}
          csrf={csrf}
          value={metadata.data}
          onChange={(next) =>
            setLoad((current) =>
              current.kind === "ok"
                ? {
                    ...current,
                    detail: { ...current.detail, metadata: { state: "ok", data: next } },
                  }
                : current,
            )
          }
        />
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

function MetadataClaimsEditor({
  userId,
  email,
  csrf,
  value,
  onChange,
}: {
  userId: string;
  email: string;
  csrf: string;
  value: UserMetadata;
  onChange: (value: UserMetadata) => void;
}) {
  const [key, setKey] = useState("");
  const [json, setJson] = useState('""');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const reserved = new Set(value.reserved_claim_names);
  const keyIsValid = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(key);
  let parsedValue: unknown;
  let jsonIsValid = true;
  try {
    parsedValue = JSON.parse(json);
  } catch {
    jsonIsValid = false;
  }

  const save = async () => {
    if (!keyIsValid || reserved.has(key) || !jsonIsValid || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/console/users/${encodeURIComponent(userId)}/metadata/${encodeURIComponent(key)}`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            "x-csrf-token": csrf,
          },
          body: JSON.stringify({ value: parsedValue }),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(failureFrom(payload, response.status).message);
        return;
      }
      const next = dataFrom<UserMetadata>(payload);
      if (next === null || typeof next.metadata !== "object" || next.metadata === null) {
        setMessage("The API returned an unrecognised metadata response.");
        return;
      }
      onChange(next);
      setMessage("Claim saved. It appears in newly issued access tokens.");
      setKey("");
      setJson('""');
    } catch {
      setMessage("The console could not reach its server.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (claim: string) => {
    if (saving) return;
    if (pendingDelete !== claim) {
      setPendingDelete(claim);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/console/users/${encodeURIComponent(userId)}/metadata/${encodeURIComponent(claim)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { accept: "application/json", "x-csrf-token": csrf },
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(failureFrom(payload, response.status).message);
        return;
      }
      const next = dataFrom<UserMetadata>(payload);
      if (next === null || typeof next.metadata !== "object" || next.metadata === null) {
        setMessage("The API returned an unrecognised metadata response.");
        return;
      }
      onChange(next);
      setPendingDelete(null);
      setMessage("Claim removed. Newly issued access tokens will no longer include it.");
    } catch {
      setMessage("The console could not reach its server.");
    } finally {
      setSaving(false);
    }
  };

  const claims = value.metadata;
  const payload = { sub: userId, email, ...claims };
  const preview = `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url(payload)}.`;

  return (
    <>
      {Object.entries(claims).length === 0 ? (
        <EmptyState
          bare
          title="No custom claims"
          description="New access tokens for this account contain only the claims issued by CSAG."
        />
      ) : (
        <div className="detail-list">
          {Object.entries(claims).map(([claim, claimValue]) => (
            <div className="detail-row" key={claim}>
              <dt className="mono">{claim}</dt>
              <dd>
                <pre className="drawer-json">{JSON.stringify(claimValue, null, 2)}</pre>
                <div className="actions-row" style={{ marginTop: 8 }}>
                  <Button
                    size="small"
                    onClick={() => {
                      setKey(claim);
                      setJson(JSON.stringify(claimValue, null, 2));
                      setMessage(null);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="small"
                    variant="danger-ghost"
                    disabled={saving}
                    onClick={() => void remove(claim)}
                  >
                    {pendingDelete === claim ? "Confirm remove" : "Remove"}
                  </Button>
                  {pendingDelete === claim ? (
                    <Button size="small" onClick={() => setPendingDelete(null)}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </dd>
            </div>
          ))}
        </div>
      )}

      <Card
        title={key && Object.hasOwn(claims, key) ? `Edit ${key}` : "Add a custom claim"}
        style={{ marginTop: 14 }}
      >
        <label className="field-label" htmlFor={`claim-key-${userId}`}>
          Claim name
        </label>
        <input
          id={`claim-key-${userId}`}
          className="text-input"
          autoComplete="off"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder="plan"
        />
        {reserved.has(key) ? <p className="hint">CSAG reserves this claim name: {key}.</p> : null}
        <label className="field-label" htmlFor={`claim-value-${userId}`} style={{ marginTop: 10 }}>
          JSON value
        </label>
        <textarea
          id={`claim-value-${userId}`}
          className="text-input"
          rows={4}
          spellCheck={false}
          value={json}
          onChange={(event) => setJson(event.target.value)}
        />
        {!jsonIsValid ? (
          <p className="hint">
            Enter one valid JSON value, such as a string, number, boolean, array, or object.
          </p>
        ) : null}
        <div className="actions-row" style={{ marginTop: 10 }}>
          <Button
            variant="primary"
            disabled={!keyIsValid || reserved.has(key) || !jsonIsValid || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save claim"}
          </Button>
          {key ? (
            <Button
              disabled={saving}
              onClick={() => {
                setKey("");
                setJson('""');
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
        {message ? (
          <p className="hint" role="status">
            {message}
          </p>
        ) : null}
      </Card>

      <Card title="Unsigned sample preview" style={{ marginTop: 14 }}>
        <p className="hint">
          This sample uses the account&apos;s current metadata and is not signed or accepted as an
          access token. Changes appear in tokens CSAG issues after the account signs in again.
        </p>
        <Button size="small" onClick={() => setPreviewOpen((open) => !open)}>
          {previewOpen ? "Hide preview" : "Preview sample token"}
        </Button>
        {previewOpen ? (
          <pre className="drawer-json" style={{ marginTop: 10, overflowWrap: "anywhere" }}>
            {preview}
          </pre>
        ) : null}
      </Card>
    </>
  );
}

function base64Url(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
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
        <span className="audit-event-cell">
          <span className={`audit-dot ${auditEventTone(event.type)}`} aria-hidden="true" />
          <span className="audit-event">{event.type}</span>
        </span>
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
