"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { ErrorState } from "@/components/states";
import { failureFrom, type ConsoleFailure } from "@/lib/console-response";
import {
  SECOND_FACTOR_LABELS,
  isSecondFactorMethod,
  type SecondFactorMethod,
} from "@/lib/second-factor";

/**
 * The sign-in form.
 *
 * It walks the two steps CrydenSync's login actually has: a password, and then
 * whatever second factor the account has enrolled. The pause between them is the
 * API's, not the console's: a correct password that is not enough comes back as
 * a pause naming the methods the account can finish with, and this renders that
 * answer rather than guessing which factors exist.
 *
 * Nothing here holds a token. The console's session cookie is httpOnly, so the
 * page cannot read it, and the only things that travel through this component
 * are what the operator typed and, for a passkey, the browser's own assertion.
 */

type Failure = ConsoleFailure;

type AuthenticationOptions = Parameters<typeof startAuthentication>[0]["optionsJSON"];

const UNREACHABLE: Failure = {
  message: "The console could not reach its own server. Check your connection and try again.",
  code: "console_unreachable",
};

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"password" | "second-factor">("password");
  const [methods, setMethods] = useState<SecondFactorMethod[]>([]);
  const [method, setMethod] = useState<SecondFactorMethod>("totp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const firstField = useRef<HTMLInputElement>(null);

  // Focus the field the operator now has to fill, so the form is usable from the
  // keyboard without reaching for the mouse on every step.
  useEffect(() => {
    firstField.current?.focus();
  }, [step]);

  async function post(path: string, body: unknown): Promise<{ ok: boolean; payload: unknown; status: number }> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    const payload: unknown = await response.json().catch(() => null);
    return { ok: response.ok, payload, status: response.status };
  }

  function enterConsole() {
    router.replace("/dashboard");
    // The dashboard is a server component: it has to be rendered again for the
    // new session cookie to be seen.
    router.refresh();
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFailure(null);

    try {
      const answer = await post("/api/auth/login", { email, password });
      if (!answer.ok) {
        setFailure(failureFrom(answer.payload, answer.status));
        return;
      }

      const data = (answer.payload as { data?: { secondFactorRequired?: unknown; methods?: unknown } })
        .data;

      if (data?.secondFactorRequired === true) {
        const offered = Array.isArray(data.methods)
          ? data.methods
              .map((entry) => String(entry))
              .filter(isSecondFactorMethod)
          : [];
        setMethods(offered);
        setMethod(offered[0] ?? "totp");
        // The password has done its part and is not needed again.
        setPassword("");
        setCode("");
        setStep("second-factor");
        return;
      }

      enterConsole();
    } catch {
      setFailure(UNREACHABLE);
    } finally {
      setPending(false);
    }
  }

  async function submitPasskey() {
    const begin = await post("/api/auth/login/passkey/begin", {});
    if (!begin.ok) {
      setFailure(failureFrom(begin.payload, begin.status));
      return;
    }

    const options = (begin.payload as { data?: { options?: unknown } }).data?.options;

    let credential: unknown;
    try {
      credential = await startAuthentication({ optionsJSON: options as AuthenticationOptions });
    } catch {
      // Dismissed by the operator, or no passkey on this device matches. Either
      // way the API has not been asked anything, so this is not an API failure.
      setFailure({
        message: "That passkey prompt was dismissed, or this device has no passkey for the account.",
        code: "passkey_cancelled",
      });
      return;
    }

    const finish = await post("/api/auth/login/passkey/finish", { credential });
    if (!finish.ok) {
      setFailure(failureFrom(finish.payload, finish.status));
      return;
    }
    enterConsole();
  }

  async function submitSecondFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFailure(null);

    try {
      if (method === "webauthn") {
        await submitPasskey();
        return;
      }

      const path =
        method === "totp" ? "/api/auth/login/totp" : "/api/auth/login/recovery-code";
      const answer = await post(path, { code });
      if (!answer.ok) {
        setFailure(failureFrom(answer.payload, answer.status));
        return;
      }
      enterConsole();
    } catch {
      setFailure(UNREACHABLE);
    } finally {
      setPending(false);
    }
  }

  const codeLabel = method === "recovery_code" ? "Recovery code" : "Authenticator code";
  const codeHint =
    method === "recovery_code"
      ? "One of the codes you saved when you enrolled. Each works once."
      : "The six digits from your authenticator app.";

  return (
    <div className="auth-screen">
      <main className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">
            <Image src="/cryden-icon.png" alt="" width={22} height={22} priority />
          </span>
          <span>
            <b>csax+</b>
            <span>CRYDENSYNC CONSOLE</span>
          </span>
        </div>

        <div className="card">
          <ol className="auth-steps">
            <li
              className={step === "password" ? "auth-step current" : "auth-step done"}
              aria-current={step === "password" ? "step" : undefined}
            >
              <span className="dot" aria-hidden="true" />
              Password
            </li>
            <li
              className={step === "second-factor" ? "auth-step current" : "auth-step"}
              aria-current={step === "second-factor" ? "step" : undefined}
            >
              <span className="dot" aria-hidden="true" />
              Second factor
            </li>
          </ol>

          {failure !== null ? (
            <div className="auth-error">
              <ErrorState
                bare
                title="That sign-in did not go through"
                description={failure.message}
                code={failure.code ?? undefined}
              />
            </div>
          ) : null}

          {step === "password" ? (
            <form onSubmit={submitPassword} noValidate>
              <p className="auth-lede">
                Sign in with the CrydenSync account that has operator access. The API decides what
                that account may do; the console only renders what it is allowed to see.
              </p>

              <div className="field-group">
                <label className="field-label" htmlFor="login-email">
                  Email
                </label>
                <input
                  id="login-email"
                  ref={firstField}
                  className="text-input"
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  value={email}
                  disabled={pending}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="login-password">
                  Password
                </label>
                <input
                  id="login-password"
                  className="text-input"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  disabled={pending}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
                {pending ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          ) : (
            <form onSubmit={submitSecondFactor}>
              <p className="auth-lede">
                Your password was accepted. This account has more than one step, so finish it with
                whichever factor you have.
              </p>

              {methods.length > 1 ? (
                <fieldset className="method-choice">
                  <legend className="field-label">Finish with</legend>
                  {methods.map((option) => (
                    <label className="method-option" key={option}>
                      <input
                        type="radio"
                        name="method"
                        value={option}
                        checked={method === option}
                        disabled={pending}
                        onChange={() => setMethod(option)}
                      />
                      {SECOND_FACTOR_LABELS[option]}
                    </label>
                  ))}
                </fieldset>
              ) : null}

              {method === "webauthn" ? (
                <p className="auth-lede">
                  Your browser will ask for the passkey registered to this account.
                </p>
              ) : (
                <div className="field-group">
                  <label className="field-label" htmlFor="login-code">
                    {codeLabel}
                  </label>
                  <input
                    id="login-code"
                    ref={firstField}
                    className="text-input"
                    type="text"
                    name="code"
                    inputMode={method === "totp" ? "numeric" : "text"}
                    autoComplete="one-time-code"
                    required
                    value={code}
                    disabled={pending}
                    onChange={(event) => setCode(event.target.value)}
                  />
                  <p className="hint">{codeHint}</p>
                </div>
              )}

              <div className="actions-row">
                <Button type="submit" variant="primary" disabled={pending} aria-busy={pending}>
                  {pending ? "Checking..." : "Continue"}
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setStep("password");
                    setFailure(null);
                    setCode("");
                  }}
                >
                  Start over
                </Button>
              </div>
            </form>
          )}
        </div>

        <p className="auth-foot">
          Your session is kept server-side in an encrypted cookie and renewed as you work. The
          console never puts a token where a page script can read it.
        </p>
      </main>
    </div>
  );
}
