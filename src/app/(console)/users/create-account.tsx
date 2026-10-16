"use client";

import { useCallback, useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { ErrorState } from "@/components/states";
import { dataFrom, failureFrom, type ConsoleFailure } from "@/lib/console-response";
import { CSRF_HEADER } from "@/lib/csrf-header";
import { ACCOUNT_EXISTS_DETAIL, CREATE_ACCOUNT_DETAIL, PASSWORD_POLICY_DETAIL } from "@/lib/users";
import type { AdminUser } from "@/server/cryden/admin";

/**
 * The form that registers an account on the deployment.
 *
 * One confirm modal over one POST to the console's own create route, which
 * relays to the API's `cryden.SignUp` path. The API audits the creation with
 * the operator's id; the console's contribution is the form, the failure
 * handling that names the field to fix, and the hand-off to the drawer once
 * the account exists.
 *
 * The password is asked for twice, because a created account's first sign-in
 * depends on it being spelled as the operator intended, and nothing else on
 * this screen can recover a mistyped one. The second field's value is never
 * sent anywhere: only the first is.
 */
export function CreateAccount({
  csrf,
  onCreated,
}: {
  /** Called with the account the API created, already open in its drawer. */
  onCreated: (user: AdminUser) => void;
  csrf: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<ConsoleFailure | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setFailure(null);
  }, []);

  const reset = useCallback(() => {
    setEmail("");
    setPassword("");
    setRepeat("");
    setFailure(null);
  }, []);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFailure(null);

      if (password !== repeat) {
        setFailure({
          message: "The two passwords do not match, so the account was not created.",
          code: null,
        });
        return;
      }

      setRunning(true);

      let response: Response;
      try {
        response = await fetch("/api/console/users", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            [CSRF_HEADER]: csrf,
          },
          body: JSON.stringify({ email: email.trim(), password }),
        });
      } catch {
        setRunning(false);
        setFailure({
          message: "The console could not reach its own server, so no account was created.",
          code: "console_unreachable",
        });
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      setRunning(false);

      if (!response.ok) {
        const f = failureFrom(payload, response.status);
        // The two refusals an operator can act on in this form name their
        // field; every other failure stays the API's own sentence.
        if (f.code === "user_exists") {
          setFailure({ message: ACCOUNT_EXISTS_DETAIL, code: f.code });
        } else if (f.code === "password_policy_violation") {
          setFailure({ message: PASSWORD_POLICY_DETAIL, code: f.code });
        } else {
          setFailure(f);
        }
        return;
      }

      const result = dataFrom<{ user: AdminUser }>(payload);
      if (result === null) {
        setFailure({
          message: "The console answered the creation with a shape this form does not recognise.",
          code: "console_malformed",
        });
        return;
      }

      close();
      reset();
      onCreated(result.user);
    },
    [close, csrf, email, onCreated, password, repeat, reset],
  );

  const mismatch = repeat !== "" && password !== repeat;

  return (
    <>
      <Button size="small" variant="primary" onClick={() => setOpen(true)}>
        New account
      </Button>

      {open ? (
        <Modal
          open
          onClose={close}
          variant="wide"
          title="Create an account"
          description={CREATE_ACCOUNT_DETAIL}
          actions={
            <form className="stack" onSubmit={(event) => void submit(event)}>
              <div className="field-group">
                <label className="field-label" htmlFor="create-account-email">
                  Email address
                </label>
                <input
                  id="create-account-email"
                  className="text-input"
                  type="email"
                  value={email}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="create-account-password">
                  Initial password
                </label>
                <input
                  id="create-account-password"
                  className="text-input"
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="create-account-password-2">
                  Repeat the password
                </label>
                <input
                  id="create-account-password-2"
                  className="text-input"
                  type="password"
                  value={repeat}
                  autoComplete="new-password"
                  aria-invalid={mismatch}
                  onChange={(event) => setRepeat(event.target.value)}
                />
              </div>

              {failure !== null ? (
                <ErrorState bare description={failure.message} code={failure.code ?? undefined} />
              ) : null}

              <div className="actions-row">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={running || email.trim() === "" || password === "" || mismatch}
                >
                  {running ? "Creating" : "Create account"}
                </Button>
                <Button disabled={running} onClick={close}>
                  Cancel
                </Button>
              </div>
            </form>
          }
        />
      ) : null}
    </>
  );
}
