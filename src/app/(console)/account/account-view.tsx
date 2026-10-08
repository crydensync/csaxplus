"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState, ErrorState, LoadingAnnouncement, Skeleton } from "@/components/states";
import { formatInstant } from "@/lib/format";
import {
  addPasskey,
  canUsePasskeys,
  confirmItIsYou,
  listPasskeys,
  removePasskey,
  type PasskeyRow,
  type StepUpRefusal,
} from "@/lib/stepup";

/**
 * The Account screen: the step-up passkeys this operator holds.
 *
 * These are the console's own second factor, not the engine's. The API has no
 * step-up check, so the console keeps one for the operations it decides are
 * worth it, and this is where an operator sees and manages theirs (BUILD_NOTE
 * sections 5 and 11.2).
 *
 * Three things about this screen are deliberate and easy to get wrong:
 *
 * - Registering the *first* passkey needs no step-up and the second does. There
 *   would be nothing to step up with the first time, so requiring a grant would
 *   mean the second factor could never be turned on at all. The screen decides
 *   nothing here: it sends the grant when it has one, and the route is where the
 *   rule lives.
 * - Nothing reports success it did not see. Every change re-reads the list from
 *   the route afterwards, so a row on screen is one the server confirmed.
 * - A dismissed prompt is not an error. The operator closing the browser's
 *   passkey sheet is them deciding not to, and it gets a quiet line rather than
 *   an alert.
 * - The CSRF token arrives as a prop rather than being read here. It is sealed
 *   in an httpOnly cookie, so this component could not read it if it tried, and
 *   the server component that rendered the screen is the only thing that can
 *   hand it over.
 */

type Load =
  | { kind: "loading" }
  | { kind: "failed"; refusal: StepUpRefusal }
  | { kind: "ok"; passkeys: PasskeyRow[] };

type Progress = "idle" | "working";

export function AccountView({ csrf }: { csrf: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [progress, setProgress] = useState<Progress>("idle");
  const [notice, setNotice] = useState<StepUpRefusal | null>(null);
  const [deviceName, setDeviceName] = useState("");
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

    setLoad(result.ok ? { kind: "ok", passkeys: result.value.passkeys } : { kind: "failed", refusal: result.refusal });
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  const add = useCallback(async () => {
    setNotice(null);
    setProgress("working");

    // The list on screen is the authority on whether this is the first passkey,
    // because the route that counts is the one that decides. An operator whose
    // list has not loaded yet is treated as having one: asking for a step-up
    // that turns out not to be needed costs a prompt, and skipping one that is
    // needed would have the route refuse and send them round again anyway.
    const held = load.kind === "ok" ? load.passkeys.length : 1;

    const result =
      held === 0
        ? await addPasskey({ deviceName, csrf })
        : await confirmItIsYou({ purpose: "passkey.register", csrf }).then((confirmed) =>
            confirmed.ok
              ? addPasskey({ deviceName, csrf, grant: confirmed.value.grantId })
              : confirmed,
          );

    if (!mounted.current) return;
    setProgress("idle");

    if (!result.ok) {
      setNotice(result.refusal);
      return;
    }
    setDeviceName("");
    await read();
  }, [csrf, deviceName, load, read]);

  const remove = useCallback(
    async (passkey: PasskeyRow) => {
      setNotice(null);
      setProgress("working");

      const confirmed = await confirmItIsYou({ purpose: "passkey.remove", csrf });
      const result = confirmed.ok
        ? await removePasskey({ id: passkey.id, csrf, grant: confirmed.value.grantId })
        : confirmed;

      if (!mounted.current) return;
      setProgress("idle");

      if (!result.ok) {
        setNotice(result.refusal);
        return;
      }
      await read();
    },
    [csrf, read],
  );

  const busy = progress === "working";

  return (
    <div className="stack">
      <Card
        title="Step-up passkeys"
        hint="A passkey here confirms it is you before the console does something it will not do on a session alone."
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
            description="Add one to confirm it is you before the console adds or removes a passkey. The first one needs no confirmation, because there is nothing to confirm with yet."
          />
        ) : null}

        {load.kind === "ok" && load.passkeys.length > 0 ? (
          <ul className="passkey-list">
            {load.passkeys.map((passkey) => (
              <li key={passkey.id}>
                <div>
                  <b>{passkey.deviceName}</b>
                  <span className="hint">
                    Added {formatInstant(passkey.createdAt)}
                    {passkey.lastUsedAt === null
                      ? ", not used yet"
                      : `, last used ${formatInstant(passkey.lastUsedAt)}`}
                    {passkey.backedUp ? ", synced across your devices" : ""}
                  </span>
                </div>
                <Button
                  variant="danger-ghost"
                  size="small"
                  disabled={busy || load.passkeys.length <= 1}
                  title={
                    load.passkeys.length <= 1
                      ? "This is your only passkey. Add another before removing it."
                      : undefined
                  }
                  onClick={() => void remove(passkey)}
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
        hint="The key stays on your device. The console stores only its public half."
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
                value={deviceName}
                maxLength={64}
                placeholder="Work laptop"
                autoComplete="off"
                onChange={(event) => setDeviceName(event.target.value)}
              />
            </div>
            <Button
              variant="primary"
              disabled={busy || deviceName.trim() === ""}
              onClick={() => void add()}
            >
              {busy ? "Waiting for your key" : "Add passkey"}
            </Button>
          </div>
        ) : (
          <EmptyState
            bare
            title="This browser cannot use passkeys"
            description="The console needs WebAuthn to confirm it is you. A newer browser, or a security key, will do it."
          />
        )}

        {notice !== null ? (
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
    </div>
  );
}
