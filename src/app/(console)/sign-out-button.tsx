"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";

/**
 * Ends the session.
 *
 * Two things can be true at once and the operator is told both: the console
 * cookie is always cleared, and `revoked` says whether the API also ended its
 * own session. When it did not, this stays on the page instead of navigating,
 * because that sentence is the whole point and it would be gone by the time the
 * sign-in screen rendered. See DECISIONS.md D11.
 *
 * It lives beside the topbar rather than inside one screen because every screen
 * carries it. When the shell grows a place for it that is not a screen's topbar,
 * this moves there rather than being copied.
 */
export function SignOutButton({ csrf }: { csrf: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function signOut() {
    setPending(true);
    setNote(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({}),
        credentials: "same-origin",
      });

      if (!response.ok) {
        setNote("That sign-out did not go through. Nothing was changed, so try again.");
        return;
      }

      const payload = (await response.json().catch(() => null)) as {
        data?: { revoked?: unknown };
      } | null;

      if (payload?.data?.revoked !== true) {
        setNote(
          "Signed out of the console. The API session could not be revoked, so it stays live until it expires on its own.",
        );
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setNote("The console could not reach its own server, so you are still signed in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <Button variant="primary" disabled={pending} aria-busy={pending} onClick={signOut}>
          {pending ? "Signing out..." : "Sign out"}
        </Button>
      </div>
      {note !== null ? (
        <p className="hint" role="status">
          {note}{" "}
          <Link href="/login" onClick={() => router.refresh()}>
            Go to sign-in
          </Link>
        </p>
      ) : null}
    </div>
  );
}
