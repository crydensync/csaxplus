"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Pill } from "@/components/Pill";
import { Drawer } from "@/components/Drawer";
import { EmptyState, ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatCount, formatInstant } from "@/lib/format";
import type { AdminOperator, AdminOperators } from "@/server/cryden/admin";
import type { OperatorPasskeys, OperatorSessions } from "@/server/cryden/admin";
import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { CSRF_HEADER } from "@/lib/csrf-header";
import type { OperatorInvitation } from "@/server/cryden/admin";

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
  const [managed, setManaged] = useState<AdminOperator | null>(null);
  const [operatorSessions, setOperatorSessions] = useState<OperatorSessions | null>(null);
  const [operatorPasskeys, setOperatorPasskeys] = useState<OperatorPasskeys | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "viewer">("viewer");
  const [invitation, setInvitation] = useState<OperatorInvitation | null>(null);
  const [invitationURL, setInvitationURL] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const invite = useCallback(async () => {
    setBusy("invite");
    setInviteError(null);
    setInvitation(null);
    setInvitationURL("");
    try {
      const purpose = "operator_invite" as const;
      const begin = await fetch("/api/console/operators/step-up/begin", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
        body: JSON.stringify({ purpose }),
      });
      const beginPayload: unknown = await begin.json().catch(() => null);
      if (!begin.ok) throw new Error(failureFrom(beginPayload, begin.status).message);
      const offer = dataFrom<{ public_key: PublicKeyCredentialRequestOptionsJSON }>(beginPayload);
      if (!offer) throw new Error("CSAG returned invalid passkey options.");
      const credential = await startAuthentication({ optionsJSON: offer.public_key });
      const finish = await fetch("/api/console/operators/step-up/finish", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
        body: JSON.stringify({ purpose, credential }),
      });
      const finishPayload: unknown = await finish.json().catch(() => null);
      if (!finish.ok) throw new Error(failureFrom(finishPayload, finish.status).message);
      const response = await fetch("/api/console/operators/invitations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      const created = dataFrom<OperatorInvitation>(payload);
      if (!created?.token) throw new Error("CSAG did not return the one-time invitation link.");
      setInvitation(created);
      setInvitationURL(
        `${window.location.origin}/invite?token=${encodeURIComponent(created.token!)}`,
      );
      setInviteEmail("");
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Could not create the invitation.");
    } finally {
      setBusy(null);
    }
  }, [csrf, inviteEmail, inviteRole]);

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

  const readDetails = useCallback(async (operator: AdminOperator) => {
    setManaged(operator);
    setDetailError(null);
    setOperatorSessions(null);
    setOperatorPasskeys(null);
    try {
      const [sessionsResponse, passkeysResponse] = await Promise.all([
        fetch(`/api/console/operators/${encodeURIComponent(operator.user_id)}/sessions`, {
          credentials: "same-origin",
        }),
        fetch(`/api/console/operators/${encodeURIComponent(operator.user_id)}/passkeys`, {
          credentials: "same-origin",
        }),
      ]);
      const [sessionsPayload, passkeysPayload]: unknown[] = await Promise.all([
        sessionsResponse.json().catch(() => null),
        passkeysResponse.json().catch(() => null),
      ]);
      if (!sessionsResponse.ok)
        throw new Error(failureFrom(sessionsPayload, sessionsResponse.status).message);
      if (!passkeysResponse.ok)
        throw new Error(failureFrom(passkeysPayload, passkeysResponse.status).message);
      const sessions = dataFrom<OperatorSessions>(sessionsPayload);
      const passkeys = dataFrom<OperatorPasskeys>(passkeysPayload);
      if (!sessions || !passkeys)
        throw new Error(
          "The API returned operator security details this screen does not recognise.",
        );
      setOperatorSessions(sessions);
      setOperatorPasskeys(passkeys);
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Could not load operator security details.",
      );
    }
  }, []);

  const manageAction = useCallback(
    async (purpose: "operator_session_revoke" | "operator_passkey_remove", path: string) => {
      if (!managed) return;
      setBusy(managed.user_id);
      setDetailError(null);
      try {
        const begin = await fetch("/api/console/operators/step-up/begin", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
          body: JSON.stringify({ purpose }),
        });
        const beginPayload: unknown = await begin.json().catch(() => null);
        if (!begin.ok) throw new Error(failureFrom(beginPayload, begin.status).message);
        const offer = dataFrom<{ public_key: PublicKeyCredentialRequestOptionsJSON }>(beginPayload);
        if (!offer) throw new Error("CSAG returned invalid passkey options.");
        const credential = await startAuthentication({ optionsJSON: offer.public_key });
        const finish = await fetch("/api/console/operators/step-up/finish", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
          body: JSON.stringify({ purpose, credential }),
        });
        const finishPayload: unknown = await finish.json().catch(() => null);
        if (!finish.ok) throw new Error(failureFrom(finishPayload, finish.status).message);
        const response = await fetch(path, {
          method: "DELETE",
          credentials: "same-origin",
          headers: { [CSRF_HEADER]: csrf },
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
        await readDetails(managed);
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : "The operator action failed.");
      } finally {
        setBusy(null);
      }
    },
    [csrf, managed, readDetails],
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
                  <Button
                    disabled={busy === operator.user_id}
                    onClick={() => void readDetails(operator)}
                  >
                    Manage
                  </Button>
                </div>
              ),
            } as Column<AdminOperator>,
          ]
        : []),
    ],
    [busy, mutate, owner, readDetails],
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
      {owner ? (
        <Card
          title="Invite an operator"
          hint="Create a one-time link for an existing or future CrydenSync account."
        >
          <p className="hint" style={{ margin: "0 0 16px" }}>
            A fresh passkey confirmation is required. CSAG does not send email. The recipient must
            register in the consuming app first, then accept this link while signed in with the
            invited email. Links expire after seven days.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
            <label style={{ flex: "1 1 260px" }}>
              Email address
              <input
                type="email"
                autoComplete="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="person@example.com"
              />
            </label>
            <label>
              Role
              <select
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as "admin" | "viewer")}
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <Button
              variant="primary"
              disabled={busy !== null || !inviteEmail.trim()}
              onClick={() => void invite()}
            >
              {busy === "invite" ? "Confirming…" : "Create invite link"}
            </Button>
          </div>
          {inviteError ? (
            <p className="error-text" role="alert" style={{ marginTop: 12 }}>
              {inviteError}
            </p>
          ) : null}
          {invitation ? (
            <div style={{ marginTop: 18 }}>
              <p role="status">
                Invite created for {invitation.email} as {invitation.role}. Expires{" "}
                {formatInstant(invitation.expires_at)}.
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  aria-label="One-time invitation link"
                  readOnly
                  value={invitationURL}
                  style={{ flex: "1 1 320px" }}
                />
                <Button
                  onClick={() =>
                    void navigator.clipboard.writeText(invitationURL).then(() => setCopied(true))
                  }
                >
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
              <p className="hint">
                This bearer link is shown once. Copy and deliver it securely; creating another link
                for this email invalidates it.
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}
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
          {roster ? `${formatCount(roster.total)} operators` : ""}. Invitations, access changes,
          session revocation and passkey removal require a fresh passkey confirmation.
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
      <Drawer
        open={managed !== null}
        onClose={() => setManaged(null)}
        title={managed?.email ?? "Operator security"}
        subtitle="Active sessions and registered passkeys"
      >
        {detailError ? (
          <p className="error-text" role="status">
            {detailError}
          </p>
        ) : null}
        {!operatorSessions || !operatorPasskeys ? (
          detailError ? null : (
            <p className="hint">Loading operator security details…</p>
          )
        ) : (
          <>
            <Card
              title="Sessions"
              hint={`${operatorSessions.total} active sessions`}
              action={
                <Button
                  disabled={busy !== null || operatorSessions.total === 0}
                  onClick={() => {
                    if (window.confirm(`Revoke all sessions for ${managed?.email}?`))
                      void manageAction(
                        "operator_session_revoke",
                        `/api/console/operators/${encodeURIComponent(managed!.user_id)}/sessions`,
                      );
                  }}
                >
                  Revoke all
                </Button>
              }
            >
              {operatorSessions.sessions.length === 0 ? (
                <p className="hint">No active sessions.</p>
              ) : (
                operatorSessions.sessions.map((session) => (
                  <div
                    key={session.id}
                    style={{ padding: "10px 0", borderBottom: "1px solid var(--line, #ddd)" }}
                  >
                    <b>{session.device || session.user_agent || "Unknown device"}</b>
                    <div className="hint">
                      {session.ip} · {formatInstant(session.created_at)}
                    </div>
                    <Button
                      disabled={busy !== null}
                      onClick={() =>
                        void manageAction(
                          "operator_session_revoke",
                          `/api/console/operators/${encodeURIComponent(managed!.user_id)}/sessions/${encodeURIComponent(session.id)}`,
                        )
                      }
                    >
                      Revoke
                    </Button>
                  </div>
                ))
              )}
            </Card>
            <Card
              title="Passkeys"
              hint={`${operatorPasskeys.total} registered · at least one must remain`}
            >
              {operatorPasskeys.passkeys.map((passkey) => (
                <div
                  key={passkey.credential_id}
                  style={{ padding: "10px 0", borderBottom: "1px solid var(--line, #ddd)" }}
                >
                  <b>{passkey.nickname || "Passkey"}</b>
                  <div className="hint">
                    Added {formatInstant(passkey.created_at)}
                    {passkey.last_used_at ? ` · used ${formatInstant(passkey.last_used_at)}` : ""}
                  </div>
                  <Button
                    disabled={busy !== null || operatorPasskeys.total <= 1}
                    onClick={() => {
                      if (window.confirm(`Remove ${passkey.nickname || "this passkey"}?`))
                        void manageAction(
                          "operator_passkey_remove",
                          `/api/console/operators/${encodeURIComponent(managed!.user_id)}/passkeys/${encodeURIComponent(passkey.credential_id)}`,
                        );
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </Card>
          </>
        )}
      </Drawer>
    </div>
  );
}
