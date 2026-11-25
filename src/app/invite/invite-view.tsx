"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/Button";
import { failureFrom, dataFrom } from "@/lib/console-response";
import { CSRF_HEADER } from "@/lib/csrf-header";

export function AcceptInvite({
  token,
  email,
  csrf,
}: {
  token: string;
  email: string;
  csrf: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/console/operators/invitations/accept", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
        body: JSON.stringify({ token }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(failureFrom(payload, response.status).message);
      const accepted = dataFrom<{ role: "admin" | "viewer"; email: string }>(payload);
      if (!accepted) throw new Error("CSAG returned an invitation response this page cannot read.");
      setMessage(
        `Invitation accepted for ${accepted.email} as ${accepted.role}. Sign out and sign in again to activate the new access.`,
      );
      window.history.replaceState({}, "", "/invite");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not accept this invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p>
        You are signed in as <strong>{email}</strong>.
      </p>
      <p className="hint">The invitation only works for the email address it was created for.</p>
      {!message ? (
        <Button onClick={() => void switchAccount()} disabled={busy}>
          Use a different account
        </Button>
      ) : null}
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <div>
          <p role="status">{message}</p>
          <Button onClick={() => void signOutAndReauthenticate()} disabled={busy}>
            Sign out and sign in again
          </Button>
        </div>
      ) : (
        <Button onClick={() => void accept()} disabled={busy}>
          {busy ? "Accepting…" : "Accept invitation"}
        </Button>
      )}
    </div>
  );

  async function signOutAndReauthenticate() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("Could not end the current session. Please try again.");
      router.replace("/login");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", [CSRF_HEADER]: csrf },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("Could not end the current session. Please try again.");
      const returnTo = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }
}
