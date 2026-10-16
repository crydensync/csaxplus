"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { ErrorState } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { CSRF_HEADER } from "@/lib/csrf-header";
import type { AdminActionResult, AdminUser } from "@/server/cryden/admin";

/**
 * The account actions, in the panel a list row opens.
 *
 * Each action is one confirm modal over one POST to the console's own route,
 * which relays to the API's admin path. The API audits every action with the
 * operator's id; the console's contribution is the confirm step, so a click
 * that would change somebody's account is a deliberate one, and the error
 * handling that keeps the account on screen when the action fails.
 *
 * Every action gets a confirm, including the restorations (unlock, unsuspend),
 * because every one changes an account that is not the operator's, and the
 * consequence text differs per action. A confirm whose description fits in its
 * button label is a description nobody reads, so each carries its own.
 */

/** What one action says in its confirm dialog, and what it does to the account. */
type ActionSpec = {
  action: "unlock" | "suspend" | "unsuspend" | "revoke-sessions" | "mfa-disable";
  button: string;
  title: string;
  description: string;
  confirmLabel: string;
  danger: boolean;
};

/**
 * The five actions, worded once.
 *
 * Suspend and unsuspend are one engine operation with two names, and both are
 * offered because which one was used lives in the audit trail, not in the
 * store: lifting an operator-imposed suspension and clearing an engine-imposed
 * lockout are different sentences in the account's history. Which of the pair
 * the drawer shows follows the account's state rather than being fixed, and a
 * suspension is worded as what it is: a lock with no expiry that the account's
 * sessions do not survive.
 */
const SPECS: Record<ActionSpec["action"], ActionSpec> = {
  unlock: {
    action: "unlock",
    button: "Unlock",
    title: "Clear this lockout?",
    description:
      "The failed-attempt counter and the lockout deadline are cleared together, and the account can sign in again. An account that is not locked is unlocked anyway; the action is idempotent.",
    confirmLabel: "Unlock account",
    danger: false,
  },
  suspend: {
    action: "suspend",
    button: "Suspend",
    title: "Suspend this account?",
    description:
      "The account is locked with no expiry and its live sessions are revoked. This operator cannot sign in until another operator lifts the suspension.",
    confirmLabel: "Suspend account",
    danger: true,
  },
  unsuspend: {
    action: "unsuspend",
    button: "Unsuspend",
    title: "Lift this suspension?",
    description:
      "The lockout is cleared and the account can sign in again. The lift is recorded in the account's history as an operator's action, separate from a lockout the engine cleared by time passing.",
    confirmLabel: "Lift suspension",
    danger: false,
  },
  "revoke-sessions": {
    action: "revoke-sessions",
    button: "Revoke sessions",
    title: "Revoke this account's sessions?",
    description:
      "Every live session is signed out at once. Whoever holds them is signed out of the console and the API, and will need to sign in again. Nothing else about the account changes.",
    confirmLabel: "Revoke all sessions",
    danger: true,
  },
  "mfa-disable": {
    action: "mfa-disable",
    button: "Remove MFA",
    title: "Remove this account's second factor?",
    description:
      "The TOTP enrolment is deleted without the account holder's password, and the account's sessions are revoked with it, so access held through the removed factor does not outlive its removal. The next sign-in needs only the password. This is the action to take when an operator has lost their authenticator, and the action to take with care the rest of the time.",
    confirmLabel: "Remove second factor",
    danger: true,
  },
};

const CONSOLE_UNREACHABLE: ConsoleFailure = {
  message: "The console could not reach its own server, so the action was not attempted.",
  code: "console_unreachable",
};

const CONSOLE_MALFORMED: ConsoleFailure = {
  message: "The console answered the action with a shape this panel does not recognise.",
  code: "console_malformed",
};

/** The drawer's own copy of the account, replaced by an answer when one lands. */
export function AccountActions({
  user,
  onAction,
  csrf,
}: {
  user: AdminUser;
  /** Called with the account as the API reports it after the action. */
  onAction: (user: AdminUser) => void;
  /** The session's CSRF value, from the same read that signed the screen in. */
  csrf: string;
}) {
  const [confirming, setConfirming] = useState<ActionSpec | null>(null);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);

  const close = useCallback(() => {
    setConfirming(null);
    setFailure(null);
  }, []);

  const perform = useCallback(
    async (spec: ActionSpec) => {
      setRunning(true);
      setFailure(null);

      let response: Response;
      try {
        response = await fetch(`/api/console/users/${encodeURIComponent(user.id)}/${spec.action}`, {
          method: "POST",
          credentials: "same-origin",
          headers: { accept: "application/json", [CSRF_HEADER]: csrf },
        });
      } catch {
        setRunning(false);
        setFailure(CONSOLE_UNREACHABLE);
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      setRunning(false);

      if (!response.ok) {
        setFailure(failureFrom(payload, response.status));
        return;
      }

      const result = dataFrom<AdminActionResult>(payload);
      if (result === null) {
        setFailure(CONSOLE_MALFORMED);
        return;
      }

      // The API's answer is the account as it stands, so the drawer's copy is
      // replaced rather than re-fetched, and the modal closes on a result the
      // screen has already shown.
      setConfirming(null);
      onAction(result.user);
    },
    [csrf, onAction, user.id],
  );

  // Suspension and unsuspension are one operation with two names; the drawer
  // shows the one the account's state calls for, so a locked account reads
  // "Unsuspend" and an open one reads "Suspend".
  const stateful: ActionSpec = user.locked ? SPECS.unsuspend : SPECS.suspend;

  return (
    <>
      <div className="drawer-title">Actions</div>
      <p className="hint">
        Every action here is taken on somebody else&apos;s account, and each is audited with your
        name on it.
      </p>
      <div className="actions-row">
        {!user.locked && user.failed_attempts > 0 ? (
          <Button size="small" onClick={() => setConfirming(SPECS.unlock)}>
            Reset failed attempts
          </Button>
        ) : null}
        <Button
          size="small"
          variant={stateful.danger ? "danger-ghost" : "default"}
          onClick={() => setConfirming(stateful)}
        >
          {stateful.button}
        </Button>
        <Button size="small" onClick={() => setConfirming(SPECS["revoke-sessions"])}>
          Revoke sessions
        </Button>
        <Button
          size="small"
          variant="danger-ghost"
          onClick={() => setConfirming(SPECS["mfa-disable"])}
        >
          Remove MFA
        </Button>
      </div>

      {confirming !== null ? (
        <Modal
          open
          onClose={close}
          title={confirming.title}
          // The failure rides in the description slot: the Modal takes no
          // children, and an error announced inside the dialog is read
          // where the confirm button is, which is where the retry happens.
          description={
            <>
              {confirming.description}
              {failure !== null ? (
                // Bare so it carries no title of its own: the dialog's title
                // is the question, and this is the answer to why the retry
                // did not work, read where the retry button is.
                <ErrorState bare description={failure.message} code={failure.code ?? undefined} />
              ) : null}
            </>
          }
          actions={
            <div className="actions-row">
              <Button
                variant={confirming.danger ? "danger-ghost" : "primary"}
                disabled={running}
                onClick={() => void perform(confirming)}
              >
                {running ? "Working" : confirming.confirmLabel}
              </Button>
            </div>
          }
        />
      ) : null}
    </>
  );
}
