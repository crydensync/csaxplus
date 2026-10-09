"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { EmptyState, ErrorState, LoadingAnnouncement, Skeleton } from "@/components/states";
import { formatInstant } from "@/lib/format";
import {
  addPasskey,
  canUsePasskeys,
  listPasskeys,
  removePasskey,
  type PasskeyRefusal,
  type PasskeyRow,
} from "@/lib/passkeys";

/**
 * The Account screen: the passkeys this operator holds at the API.
 *
 * These are the operator's own credentials on their API account, not the
 * console's. They are usable for anything the API signs in, and they outlive this
 * console. The screen keeps that visible in its wording, because the difference
 * matters to an operator deciding whether to enrol one here.
 *
 * Four things about this screen are deliberate and easy to get wrong:
 *
 * - Nothing reports success it did not see. Every change re-reads the list from
 *   the route afterwards, so a row on screen is one the API confirmed rather than
 *   one the browser believed it created.
 * - Removing asks for the current password, because the API requires it as
 *   re-confirmation. The console does not check it and does not keep it.
 * - A dismissed prompt is not an error. The operator closing the browser's passkey
 *   sheet is them deciding not to, and it gets a quiet line rather than an alert.
 * - The CSRF token arrives as a prop rather than being read here. It is sealed in
 *   an httpOnly cookie, so this component could not read it if it tried, and the
 *   server component that rendered the screen is the only thing that can hand it
 *   over.
 */

type Load =
  | { kind: "loading" }
  | { kind: "failed"; refusal: PasskeyRefusal }
  | { kind: "ok"; passkeys: PasskeyRow[] };

type Progress = "idle" | "working";

/** What a nickname reads as when the API holds a credential with none. */
function nameOf(passkey: PasskeyRow): string {
  return passkey.nickname.trim() === "" ? "Unnamed passkey" : passkey.nickname;
}

export function AccountView({ csrf }: { csrf: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [progress, setProgress] = useState<Progress>("idle");
  const [notice, setNotice] = useState<PasskeyRefusal | null>(null);
  const [nickname, setNickname] = useState("");
  /** The passkey the removal dialog is open for, if any. */
  const [removing, setRemoving] = useState<PasskeyRow | null>(null);
  const [password, setPassword] = useState("");
  const [supported, setSupported] = useState(true);
  const inFlight = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // Asked once, on the client, because the answer is a fact about the browser
    // and a server render would have to guess.
    setSupported(canUsePasskeys());
    return () => {
      mounted.current = false;
      inFlight.current?.abort();
    };
  }, []);

  const read = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setLoad({ kind: "loading" });
    const result = await listPasskeys();
    if (!mounted.current) return;

    setLoad(
      result.ok
        ? { kind: "ok", passkeys: result.value.passkeys }
        : { kind: "failed", refusal: result.refusal },
    );
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  const add = useCallback(async () => {
    setNotice(null);
    setProgress("working");

    const result = await addPasskey({ nickname, csrf });

    if (!mounted.current) return;
    setProgress("idle");

    if (!result.ok) {
      setNotice(result.refusal);
      return;
    }
    setNickname("");
    await read();
  }, [csrf, nickname, read]);

  const closeRemoval = useCallback(() => {
    setRemoving(null);
    setPassword("");
  }, []);

  const remove = useCallback(async () => {
    if (removing === null) return;
    setNotice(null);
    setProgress("working");

    const result = await removePasskey({
      credentialId: removing.credential_id,
      password,
      csrf,
    });

    if (!mounted.current) return;
    setProgress("idle");

    if (!result.ok) {
      // The dialog stays open so the operator can correct the password rather
      // than having to find the row and start again.
      setNotice(result.refusal);
      return;
    }
    closeRemoval();
    await read();
  }, [closeRemoval, csrf, password, read, removing]);

  const busy = progress === "working";

  return (
    <div className="stack">
      <Card
        title="Your passkeys"
        hint="Registered on your account at the API, so they work anywhere that account signs in, not only here."
      >
        {load.kind === "loading" ? (
          <>
            <LoadingAnnouncement>Reading your passkeys</LoadingAnnouncement>
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="45%" />
          </>
        ) : null}

        {load.kind === "failed" ? (
          <ErrorState
            bare
            description={load.refusal.message}
            code={load.refusal.code ?? undefined}
            onRetry={() => void read()}
          />
        ) : null}

        {load.kind === "ok" && load.passkeys.length === 0 ? (
          <EmptyState
            bare
            title="No passkey yet"
            description="Add one to sign in to the API without a password. Add a second while you still have the first: losing one device is then not a lockout."
          />
        ) : null}

        {load.kind === "ok" && load.passkeys.length > 0 ? (
          <ul className="passkey-list">
            {load.passkeys.map((passkey) => (
              <li key={passkey.credential_id}>
                <div>
                  <b>{nameOf(passkey)}</b>
                  <span className="hint">
                    Added {formatInstant(passkey.created_at)}
                    {passkey.last_used_at === undefined
                      ? ", not used yet"
                      : `, last used ${formatInstant(passkey.last_used_at)}`}
                  </span>
                </div>
                <Button
                  variant="danger-ghost"
                  size="small"
                  disabled={busy}
                  onClick={() => {
                    setNotice(null);
                    setPassword("");
                    setRemoving(passkey);
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card
        title="Add a passkey"
        hint="The key stays on your device. The API stores only its public half."
      >
        {supported ? (
          <div className="passkey-add">
            <div className="field-group">
              <label className="field-label" htmlFor="passkey-name">
                What to call it
              </label>
              <input
                id="passkey-name"
                className="text-input"
                value={nickname}
                maxLength={64}
                placeholder="Work laptop"
                autoComplete="off"
                onChange={(event) => setNickname(event.target.value)}
              />
            </div>
            <Button
              variant="primary"
              disabled={busy || nickname.trim() === ""}
              onClick={() => void add()}
            >
              {busy ? "Waiting for your key" : "Add passkey"}
            </Button>
          </div>
        ) : (
          <EmptyState
            bare
            title="This browser cannot use passkeys"
            description="Signing in with a passkey needs WebAuthn. A newer browser, or a security key, will do it."
          />
        )}

        {notice !== null && removing === null ? (
          notice.dismissed ? (
            // The operator closed the passkey sheet. That is a decision, not a
            // fault, so it is a line rather than an alert.
            <p className="hint" role="status">
              {notice.message}
            </p>
          ) : (
            <ErrorState bare description={notice.message} code={notice.code ?? undefined} />
          )
        ) : null}
      </Card>

      <Modal
        open={removing !== null}
        onClose={closeRemoval}
        variant="wide"
        dismissible={!busy}
        title={`Remove ${removing === null ? "this passkey" : nameOf(removing)}?`}
        description="It stops working straight away. Your password confirms it is you, and the API checks it."
        actions={
          <div className="stack" style={{ marginTop: 16 }}>
            <div className="field-group">
              <label className="field-label" htmlFor="passkey-password">
                Your password
              </label>
              <input
                id="passkey-password"
                className="text-input"
                type="password"
                value={password}
                autoComplete="current-password"
                autoFocus
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {notice !== null && removing !== null ? (
              <ErrorState bare description={notice.message} code={notice.code ?? undefined} />
            ) : null}

            <div className="actions-row">
              <Button
                variant="danger-ghost"
                disabled={busy || password === ""}
                onClick={() => void remove()}
              >
                {busy ? "Removing" : "Remove passkey"}
              </Button>
              <Button disabled={busy} onClick={closeRemoval}>
                Keep it
              </Button>
            </div>
          </div>
        }
      />
    </div>
  );
}
