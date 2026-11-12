"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { Pill } from "@/components/Pill";
import { ErrorState, LoadingAnnouncement } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatInstant } from "@/lib/format";
import { CSRF_HEADER } from "@/lib/csrf-header";
import type { ApiKeyRecord, CreatedApiKey } from "@/server/auth/api-auth";

const UNREACHABLE: ConsoleFailure = {
  message: "The console could not reach its server.",
  code: "console_unreachable",
};

export function APIKeysView({ csrf }: { csrf: string }) {
  const [keys, setKeys] = useState<ApiKeyRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState(0);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRecord | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  const read = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch("/api/console/api-keys", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<ApiKeyRecord[]>(payload);
      if (result === null || !isApiKeyList(result)) {
        setFailure({
          message: "The API returned a key list this screen does not recognise.",
          code: "api_malformed",
        });
        return;
      }
      setKeys(result);
    } catch {
      setFailure(UNREACHABLE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setFailure(null);
    setCopied(false);
    try {
      const response = await fetch("/api/console/api-keys", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          [CSRF_HEADER]: csrf,
        },
        body: JSON.stringify({ name: name.trim(), expires_in_days: expiry }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      const result = dataFrom<CreatedApiKey>(payload);
      if (result === null || !isCreatedKey(result)) {
        setFailure({
          message: "The API returned a new key in an unexpected shape.",
          code: "api_malformed",
        });
        return;
      }
      setCreated(result);
      setName("");
      setExpiry(0);
      setKeys((current) => (current === null ? [result.api_key] : [result.api_key, ...current]));
    } catch {
      setFailure({
        message: "The console could not reach its server. The key was not created.",
        code: "console_unreachable",
      });
    } finally {
      setCreating(false);
    }
  }

  async function revoke() {
    if (revokeTarget === null) return;
    setRevoking(true);
    setFailure(null);
    try {
      const response = await fetch(`/api/console/api-keys/${encodeURIComponent(revokeTarget.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { accept: "application/json", [CSRF_HEADER]: csrf },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }
      setRevokeTarget(null);
      await read();
    } catch {
      setFailure({
        message: "The console could not reach its server. The key was not revoked.",
        code: "console_unreachable",
      });
    } finally {
      setRevoking(false);
    }
  }

  async function copyKey() {
    if (created === null) return;
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
    } catch {
      setFailure({
        message: "Clipboard access was denied. Select and copy the key manually.",
        code: "clipboard_unavailable",
      });
    }
  }

  const columns = useMemo<Column<ApiKeyRecord>[]>(
    () => [
      {
        key: "name",
        header: "Name",
        cell: (key) => (
          <>
            <b>{key.name || "Unnamed key"}</b>
            <div className="hint mono">{key.prefix}…</div>
          </>
        ),
      },
      {
        key: "status",
        header: "Status",
        cell: (key) =>
          key.expired ? <Pill tone="red">Expired</Pill> : <Pill tone="green">Active</Pill>,
      },
      { key: "created", header: "Created", cell: (key) => formatInstant(key.created_at) },
      {
        key: "last_used",
        header: "Last used",
        cell: (key) =>
          key.last_used_at ? formatInstant(key.last_used_at) : <span className="hint">Never</span>,
      },
      {
        key: "expires",
        header: "Expires",
        cell: (key) =>
          key.expires_at ? formatInstant(key.expires_at) : <span className="hint">Never</span>,
      },
      {
        key: "scopes",
        header: "Scopes",
        cell: (key) =>
          key.scopes.length ? key.scopes.join(", ") : <span className="hint">None</span>,
      },
      {
        key: "action",
        header: "",
        align: "right",
        cell: (key) => (
          <Button size="small" variant="danger-ghost" onClick={() => setRevokeTarget(key)}>
            Revoke
          </Button>
        ),
      },
    ],
    [],
  );

  if (loading && keys === null)
    return (
      <div className="view anim">
        <LoadingAnnouncement>Loading API keys</LoadingAnnouncement>
      </div>
    );
  if (failure !== null && keys === null) {
    return (
      <div className="view anim">
        <Card>
          <ErrorState
            title="API keys did not load"
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
        title="Create an API key"
        hint="The raw credential is displayed once. Store it before closing the dialog; it cannot be retrieved later."
      >
        <form onSubmit={create}>
          <div className="grid cols-2" style={{ marginTop: 14 }}>
            <label className="field-label">
              Key name
              <input
                className="text-input"
                value={name}
                maxLength={100}
                required
                onChange={(event) => setName(event.target.value)}
                placeholder="Deployment or integration"
              />
            </label>
            <label className="field-label">
              Expiry
              <select
                className="text-input"
                value={expiry}
                onChange={(event) => setExpiry(Number(event.target.value))}
              >
                <option value={0}>Never expires</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>1 year</option>
              </select>
            </label>
          </div>
          <div className="actions-row" style={{ marginTop: 14 }}>
            <Button variant="primary" type="submit" disabled={creating || name.trim().length === 0}>
              {creating ? "Creating…" : "Create key"}
            </Button>
          </div>
        </form>
      </Card>
      {failure ? (
        <Card>
          <ErrorState
            title="API key action failed"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read()}
          />
        </Card>
      ) : null}
      <div className="row-between" style={{ margin: "18px 0 10px" }}>
        <div className="section-title" style={{ margin: 0 }}>
          Your API keys
        </div>
        <Button onClick={() => void read()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <DataTable
        caption="API keys for your operator account"
        columns={columns}
        rows={keys ?? []}
        rowKey={(key) => key.id}
        loading={loading}
        emptyState={
          <Card title="No API keys">
            <p className="hint">
              Create a key for a trusted script or deployment that calls the API as your account.
            </p>
          </Card>
        }
        minWidthPx={1000}
      />
      {created ? (
        <Modal
          open
          onClose={() => {
            setCreated(null);
            setCopied(false);
          }}
          title="Copy your API key now"
          description={
            <>
              {created.notice}
              <pre
                className="mono"
                style={{
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  userSelect: "all",
                  padding: 12,
                  background: "var(--surface-2)",
                  borderRadius: 8,
                }}
              >
                {created.key}
              </pre>
            </>
          }
          actions={
            <div className="actions-row">
              <Button variant="primary" onClick={() => void copyKey()}>
                {copied ? "Copied" : "Copy key"}
              </Button>
              <Button
                onClick={() => {
                  setCreated(null);
                  setCopied(false);
                }}
              >
                Done
              </Button>
            </div>
          }
        />
      ) : null}
      {revokeTarget ? (
        <Modal
          open
          onClose={() => setRevokeTarget(null)}
          title={`Revoke ${revokeTarget.name || "this API key"}?`}
          description="Any integration using this credential will stop authenticating. Revocation is permanent; create a replacement key if needed."
          actions={
            <div className="actions-row">
              <Button variant="danger-ghost" disabled={revoking} onClick={() => void revoke()}>
                {revoking ? "Revoking…" : "Revoke key"}
              </Button>
            </div>
          }
        />
      ) : null}
    </div>
  );
}

function isApiKeyList(value: ApiKeyRecord[]): boolean {
  return (
    Array.isArray(value) &&
    value.every((key) => typeof key.id === "string" && typeof key.prefix === "string")
  );
}

function isCreatedKey(value: CreatedApiKey): boolean {
  return (
    typeof value.key === "string" &&
    value.key.length > 0 &&
    typeof value.notice === "string" &&
    typeof value.api_key?.id === "string"
  );
}
