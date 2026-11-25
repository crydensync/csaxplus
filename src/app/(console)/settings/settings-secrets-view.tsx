"use client";

import { useCallback, useEffect, useState } from "react";
import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { IconShieldCheck } from "@/components/icons";
import { EmptyState, ErrorState, LoadingAnnouncement } from "@/components/states";
import { CSRF_HEADER } from "@/lib/csrf-header";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { formatInstant } from "@/lib/format";
import type { Role } from "@/server/auth/roles";

type Secret = {
  name: string;
  source: "environment" | "file" | "vault";
  tags: string[];
  updated_at: string | null;
  masked: string;
};
type SecretList = { secrets: Secret[] };
type Revealed = { name: string; source: Secret["source"]; value: string; until: number };
type Editor = { name: string; value: string; tags: string };

const EMPTY_EDITOR: Editor = { name: "", value: "", tags: "" };
const MASK_MS = 20_000;

function isSecretList(value: unknown): value is SecretList {
  if (typeof value !== "object" || value === null || !("secrets" in value)) return false;
  const secrets = (value as { secrets: unknown }).secrets;
  return (
    Array.isArray(secrets) &&
    secrets.every((item) => {
      if (typeof item !== "object" || item === null) return false;
      const secret = item as Record<string, unknown>;
      return (
        typeof secret.name === "string" &&
        ["environment", "file", "vault"].includes(String(secret.source)) &&
        Array.isArray(secret.tags) &&
        typeof secret.masked === "string" &&
        (secret.updated_at === null || typeof secret.updated_at === "string")
      );
    })
  );
}

export function SettingsSecretsView({ csrf, role }: { csrf: string; role: Role }) {
  const [secrets, setSecrets] = useState<Secret[] | null>(null);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const canManage = role === "owner" || role === "admin";

  const read = useCallback(async () => {
    setLoading(true);
    setFailure(null);
    try {
      const response = await fetch("/api/console/secrets", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw Object.assign(new Error(failureFrom(payload, response.status).message), {
          code: failureFrom(payload, response.status).code,
        });
      const data = dataFrom<SecretList>(payload);
      if (data === null || !isSecretList(data))
        throw new Error("The server returned secret metadata this screen does not recognise.");
      setSecrets(data.secrets);
    } catch (error) {
      setFailure({
        message: error instanceof Error ? error.message : "Secret metadata could not be read.",
        code: "secrets_unavailable",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void read();
  }, [read]);
  useEffect(() => {
    if (revealed === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((revealed.until - Date.now()) / 1000));
      setSeconds(left);
      if (left === 0) setRevealed(null);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    const hideWhenAway = () => {
      if (document.visibilityState !== "visible") setRevealed(null);
    };
    document.addEventListener("visibilitychange", hideWhenAway);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", hideWhenAway);
    };
  }, [revealed]);

  const stepUp = useCallback(
    async (purpose: "secret_reveal" | "secret_mutation", action: () => Promise<Response>) => {
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
      const response = await action();
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      return dataFrom<unknown>(payload);
    },
    [csrf],
  );

  const reveal = useCallback(
    async (secret: Secret) => {
      setBusy(true);
      setNotice(null);
      setRevealed(null);
      try {
        const data = await stepUp("secret_reveal", () =>
          fetch("/api/console/secrets/reveal", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
            body: JSON.stringify({ name: secret.name, source: secret.source }),
          }),
        );
        if (
          typeof data !== "object" ||
          data === null ||
          !("value" in data) ||
          typeof data.value !== "string"
        )
          throw new Error("The server returned no secret value.");
        setRevealed({
          name: secret.name,
          source: secret.source,
          value: data.value,
          until: Date.now() + MASK_MS,
        });
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The secret could not be revealed.");
      } finally {
        setBusy(false);
      }
    },
    [csrf, stepUp],
  );

  const save = useCallback(async () => {
    if (!editor) return;
    const existing =
      editor.name !== "" &&
      secrets?.some((item) => item.name === editor.name && item.source === "vault");
    const tags = editor.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    setBusy(true);
    setNotice(null);
    try {
      await stepUp("secret_mutation", () =>
        fetch(
          existing
            ? `/api/console/secrets/${encodeURIComponent(editor.name)}`
            : "/api/console/secrets",
          {
            method: existing ? "PUT" : "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
            body: JSON.stringify(
              existing
                ? { ...(editor.value ? { value: editor.value } : {}), tags }
                : { name: editor.name, value: editor.value, tags },
            ),
          },
        ),
      );
      setEditor(null);
      await read();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The secret could not be saved.");
    } finally {
      setBusy(false);
    }
  }, [csrf, editor, read, secrets, stepUp]);

  const remove = useCallback(
    async (secret: Secret) => {
      if (!window.confirm(`Delete vault secret ${secret.name}?`)) return;
      setBusy(true);
      setNotice(null);
      try {
        await stepUp("secret_mutation", () =>
          fetch(`/api/console/secrets/${encodeURIComponent(secret.name)}`, {
            method: "DELETE",
            credentials: "same-origin",
            headers: { [CSRF_HEADER]: csrf },
          }),
        );
        await read();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The secret could not be deleted.");
      } finally {
        setBusy(false);
      }
    },
    [csrf, read, stepUp],
  );

  const copy = useCallback(
    async (secret: Secret) => {
      if (!revealed || revealed.name !== secret.name || revealed.source !== secret.source) return;
      try {
        await navigator.clipboard.writeText(revealed.value);
        const response = await fetch("/api/console/secrets/copy", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
          body: JSON.stringify({ name: secret.name, source: secret.source }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
        setNotice(`Copied ${secret.name}. It will be masked in ${seconds} seconds.`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Clipboard access was denied.");
      }
    },
    [csrf, revealed, seconds],
  );

  if (loading && secrets === null)
    return (
      <div className="view anim spaced-view">
        <LoadingAnnouncement>Loading secret metadata</LoadingAnnouncement>
      </div>
    );

  return (
    <div className="view anim spaced-view">
      <div className="secrets-banner">
        <div className="secrets-banner-left">
          <IconShieldCheck />
          <div>
            <b>Secrets stay masked until you verify with a passkey</b>
            <span>
              Vault values are encrypted at rest. Environment and mounted-file values are read-only.
            </span>
          </div>
        </div>
        <Button
          variant="primary"
          disabled={!canManage || busy}
          onClick={() => {
            setNotice(null);
            setEditor({ ...EMPTY_EDITOR });
          }}
        >
          Add vault secret
        </Button>
      </div>
      {failure ? (
        <Card>
          <ErrorState
            title="Secret metadata did not load"
            description={failure.message}
            code={failure.code ?? undefined}
            onRetry={() => void read()}
          />
        </Card>
      ) : null}
      {notice ? (
        <p className="hint" role="status">
          {notice}
        </p>
      ) : null}
      {revealed ? (
        <Card title={`Revealed ${revealed.name}`} hint={`Masked again in ${seconds} seconds.`}>
          <div className="secret-reveal">
            <code>{revealed.value}</code>
            <div className="actions-row">
              <Button
                disabled={busy}
                onClick={() =>
                  void copy({
                    name: revealed.name,
                    source: revealed.source,
                    tags: [],
                    updated_at: null,
                    masked: "",
                  })
                }
              >
                Copy
              </Button>
              <Button onClick={() => setRevealed(null)}>Mask now</Button>
            </div>
          </div>
        </Card>
      ) : null}
      <Card
        title="Managed secrets"
        hint={`${secrets?.length ?? 0} environment, file and vault entries`}
      >
        {secrets?.length ? (
          secrets.map((secret) => {
            const shown = revealed?.name === secret.name && revealed.source === secret.source;
            return (
              <div className="secret-row" key={`${secret.source}:${secret.name}`}>
                <div className="secret-key">
                  {secret.name}
                  <span className="tag">
                    {secret.source}
                    {secret.tags.length ? ` · ${secret.tags.join(", ")}` : ""}
                    {secret.updated_at ? ` · updated ${formatInstant(secret.updated_at)}` : ""}
                  </span>
                </div>
                <div
                  className={`secret-val${shown ? "" : " masked"}`}
                  aria-label={shown ? "Secret revealed" : "Secret masked"}
                >
                  {shown ? revealed.value : secret.masked}
                </div>
                <div className="secret-actions">
                  <Button size="small" disabled={busy} onClick={() => void reveal(secret)}>
                    Reveal
                  </Button>
                  {secret.source === "vault" && canManage ? (
                    <>
                      <Button
                        size="small"
                        disabled={busy}
                        onClick={() => {
                          setNotice(null);
                          setEditor({ name: secret.name, value: "", tags: secret.tags.join(", ") });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger-ghost"
                        size="small"
                        disabled={busy}
                        onClick={() => void remove(secret)}
                      >
                        Delete
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            title="No managed secrets found"
            description="Add a vault entry or configure a secret in the environment or /run/secrets."
          />
        )}
      </Card>
      <p className="hint">
        The vault key is supplied by the deployment and never stored in this database. Stop all
        console instances before rotating, update CSAX_VAULT_KEY, then start them again.
      </p>
      <Modal
        open={editor !== null}
        onClose={() => {
          if (!busy) setEditor(null);
        }}
        variant="wide"
        title={
          editor && secrets?.some((item) => item.name === editor.name && item.source === "vault")
            ? `Edit ${editor.name}`
            : "Add vault secret"
        }
        description="The value is encrypted before it is written to the console store. A fresh passkey confirmation is required."
        dismissible={!busy}
        actions={
          editor ? (
            <div className="stack secret-editor">
              {!secrets?.some((item) => item.name === editor.name && item.source === "vault") ? (
                <div className="field-group">
                  <label className="field-label" htmlFor="secret-name">
                    Name
                  </label>
                  <input
                    id="secret-name"
                    className="text-input"
                    autoComplete="off"
                    value={editor.name}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        name: event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9_]/g, "_")
                          .slice(0, 64),
                      })
                    }
                  />
                </div>
              ) : null}
              <div className="field-group">
                <label className="field-label" htmlFor="secret-value">
                  Secret value
                </label>
                <input
                  id="secret-value"
                  className="text-input"
                  type="password"
                  autoComplete="new-password"
                  value={editor.value}
                  onChange={(event) => setEditor({ ...editor, value: event.target.value })}
                  placeholder="Enter a new value to replace the current one"
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="secret-tags">
                  Tags, comma separated
                </label>
                <input
                  id="secret-tags"
                  className="text-input"
                  autoComplete="off"
                  value={editor.tags}
                  onChange={(event) => setEditor({ ...editor, tags: event.target.value })}
                  placeholder="database, production"
                />
              </div>
              {notice ? <ErrorState bare description={notice} /> : null}
              <Button
                variant="primary"
                disabled={
                  busy ||
                  !editor.name ||
                  (!editor.value &&
                    !secrets?.some((item) => item.name === editor.name && item.source === "vault"))
                }
                onClick={() => void save()}
              >
                {busy ? "Waiting for passkey" : "Save secret"}
              </Button>
            </div>
          ) : null
        }
      />
    </div>
  );
}
