import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

import { CSRF_HEADER } from "./csrf-header";

/**
 * The browser half of a WebAuthn ceremony, and the console's own routes.
 *
 * Every ceremony is the same three steps: ask the console for options, hand them
 * to the authenticator, give the answer back. The two the console runs differ
 * only in which library call the middle step makes, so they share one path here
 * and each caller says what it is doing.
 *
 * Nothing in this file decides anything. Whether an answer was acceptable is the
 * server's question, and every answer here is the console's own: a refusal
 * arrives carrying the code the route used, so a screen can tell "you have no
 * passkey yet" apart from "that did not work, try again" rather than showing one
 * sentence for both.
 *
 * Every call that changes something carries the session's CSRF token, because
 * the routes behind them run the mutation guard and it refuses a request
 * without one. The token is a required argument rather than something read from
 * a cookie here: the cookie is httpOnly, which is the whole point of the
 * double-submit check, so the value can only reach this file from the server
 * component that rendered the screen.
 */

/** The code the console uses when it could not be reached at all. */
export const CONSOLE_UNREACHABLE = "console_unreachable";

/** Why a ceremony did not finish, as much as the browser can tell. */
export type StepUpRefusal = {
  /** The console's error code, or null when the console could not be reached. */
  code: string | null;
  message: string;
  /**
   * True when the ceremony never reached the console: the operator dismissed the
   * prompt, or the browser has no WebAuthn. Nothing was attempted and nothing
   * needs reporting as a fault.
   */
  dismissed: boolean;
};

export type StepUpResult<T> = { ok: true; value: T } | { ok: false; refusal: StepUpRefusal };

function refusal(code: string | null, message: string, dismissed = false): StepUpRefusal {
  return { code, message, dismissed };
}

/**
 * Whether this browser can do WebAuthn at all.
 *
 * `window` is checked first because a client component is still rendered on the
 * server once, where the library would reach for a global that is not there.
 */
export function canUsePasskeys(): boolean {
  return typeof window !== "undefined" && browserSupportsWebAuthn();
}

/**
 * What the platform throws when the operator closes the prompt.
 *
 * Read by name rather than by class: the WebAuthn library's errors are
 * structural, and a `DOMException` from the platform takes the same path.
 */
function isCancellation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === "NotAllowedError" || name === "AbortError";
}

/**
 * What the platform throws when this authenticator already holds a passkey for
 * the console.
 *
 * Kept apart from a cancellation because it is not one, and saying so would be
 * wrong in the way that costs the operator time: a platform key refuses to enrol
 * the same account twice, so the fix is another device or removing the key that
 * is already there, not trying again. Only the registration ceremony can raise
 * it; an assertion that finds nothing throws a cancellation instead.
 */
function isAlreadyRegistered(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "InvalidStateError"
  );
}

/** The console's error envelope, read without assuming it is one. */
function refusalFrom(payload: unknown, status: number): StepUpRefusal {
  const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  return refusal(
    typeof error?.code === "string" ? error.code : null,
    typeof error?.message === "string" && error.message !== ""
      ? error.message
      : `The console answered ${status}.`,
  );
}

/**
 * One call to the console's own API, reduced to a result.
 *
 * Nothing throws. A screen has to render the failure it got rather than a stack
 * trace, so a network that never answered, a body that is not the envelope and
 * an outright refusal all come back as refusals with different codes.
 */
async function call<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: { body?: unknown; grant?: string; csrf?: string } = {},
): Promise<StepUpResult<T>> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.grant !== undefined) headers.set("x-csax-stepup", options.grant);
  if (options.csrf !== undefined) headers.set(CSRF_HEADER, options.csrf);

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch {
    return {
      ok: false,
      refusal: refusal(
        CONSOLE_UNREACHABLE,
        "The console could not reach its own server. Check your connection and try again.",
      ),
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) return { ok: false, refusal: refusalFrom(payload, response.status) };

  const data = (payload as { data?: unknown } | null)?.data;
  if (typeof data !== "object" || data === null) {
    return {
      ok: false,
      refusal: refusal(
        "console_malformed",
        "The console answered with a shape this screen does not recognise.",
      ),
    };
  }

  return { ok: true, value: data as T };
}

/**
 * Runs a ceremony: options, the authenticator, the answer.
 *
 * The options step is where a gated route is gated, so it is the caller's: it
 * earns the grant, or already holds one, before the authenticator is ever
 * involved.
 */
async function ceremony<TOptions, TAnswer, TResult>(input: {
  options: () => Promise<StepUpResult<{ options: TOptions } & Record<string, unknown>>>;
  invoke: (options: TOptions) => Promise<TAnswer>;
  /** What the operator was doing, for the message when they dismiss the prompt. */
  cancelled: string;
  /** What to say when the authenticator already holds a key. Registration only. */
  alreadyRegistered?: string;
  submit: (
    offer: { options: TOptions } & Record<string, unknown>,
    answer: TAnswer,
  ) => Promise<StepUpResult<TResult>>;
}): Promise<StepUpResult<TResult>> {
  const offered = await input.options();
  if (!offered.ok) return offered;

  let answer: TAnswer;
  try {
    answer = await input.invoke(offered.value.options);
  } catch (error) {
    if (isCancellation(error)) return { ok: false, refusal: refusal(null, input.cancelled, true) };
    if (input.alreadyRegistered !== undefined && isAlreadyRegistered(error)) {
      return { ok: false, refusal: refusal(null, input.alreadyRegistered) };
    }
    // Something else the authenticator or the browser threw. It never became a
    // request, so there is no console answer to report and nothing was changed.
    return {
      ok: false,
      refusal: refusal(null, "Your authenticator could not complete that. Try again."),
    };
  }

  return input.submit(offered.value, answer);
}

export type PasskeyOffer = {
  challengeId: string;
  options: PublicKeyCredentialCreationOptionsJSON;
};

/** The step-up route's answer: a challenge over the operator's existing keys. */
export type StepUpOffer = {
  challengeId: string;
  options: PublicKeyCredentialRequestOptionsJSON;
};

/**
 * Enrols a new passkey.
 *
 * `grant` is needed only when the operator already holds one: registering the
 * first is not gated, because there would be nothing to step up with. `csrf` is
 * sent either way. The options route only puts the step-up gate in front of a
 * later passkey, but it always runs the session guard, and carrying the token on
 * a call that turns out not to need it costs a header.
 */
export function addPasskey(input: {
  deviceName: string;
  csrf: string;
  grant?: string;
}): Promise<StepUpResult<{ passkey: { id: string; deviceName: string } }>> {
  return ceremony<
    PublicKeyCredentialCreationOptionsJSON,
    RegistrationResponseJSON,
    { passkey: { id: string; deviceName: string } }
  >({
    options: () =>
      call<PasskeyOffer>("POST", "/api/console/passkeys/options", {
        body: {},
        csrf: input.csrf,
        ...(input.grant === undefined ? {} : { grant: input.grant }),
      }),
    invoke: (options) => startRegistration({ optionsJSON: options }),
    cancelled: "That was cancelled, so no passkey was added.",
    alreadyRegistered:
      "This device already holds a passkey for the console. Use another device, or remove the one you have first.",
    submit: (offer, response) =>
      call("POST", "/api/console/passkeys", {
        body: { challengeId: offer.challengeId, deviceName: input.deviceName, response },
      }),
  });
}

/**
 * Proves the operator is at their key, and answers with the grant to carry.
 *
 * The grant is short-lived and single-use, so a caller holds it for one call and
 * no longer. `withStepUp` is the shape most callers want.
 */
export function confirmItIsYou(input: {
  purpose: "passkey.register" | "passkey.remove";
  csrf: string;
}): Promise<StepUpResult<{ grantId: string }>> {
  return ceremony<
    PublicKeyCredentialRequestOptionsJSON,
    AuthenticationResponseJSON,
    { grantId: string }
  >({
    options: () =>
      call<StepUpOffer>("POST", "/api/console/step-up/options", {
        body: { purpose: input.purpose },
        csrf: input.csrf,
      }),
    invoke: (options) => startAuthentication({ optionsJSON: options }),
    cancelled: "That was cancelled, so nothing was changed.",
    submit: (offer, response) =>
      call("POST", "/api/console/step-up/verify", {
        body: { purpose: input.purpose, challengeId: offer.challengeId, response },
        csrf: input.csrf,
      }),
  });
}

/** Confirms the operator, then makes the one gated call the grant is for. */
export async function withStepUp<T>(
  purpose: "passkey.register" | "passkey.remove",
  csrf: string,
  gated: (grant: string) => Promise<StepUpResult<T>>,
): Promise<StepUpResult<T>> {
  const confirmed = await confirmItIsYou({ purpose, csrf });
  if (!confirmed.ok) return confirmed;
  return gated(confirmed.value.grantId);
}

/** Removes one of the operator's passkeys, spending a grant earned for it. */
export function removePasskey(input: {
  id: string;
  grant: string;
  csrf: string;
}): Promise<StepUpResult<{ removed: string }>> {
  return call("DELETE", `/api/console/passkeys/${encodeURIComponent(input.id)}`, {
    grant: input.grant,
    csrf: input.csrf,
  });
}

/** The operator's own passkeys, as the list route describes them. */
export function listPasskeys(): Promise<StepUpResult<{ passkeys: PasskeyRow[] }>> {
  return call("GET", "/api/console/passkeys");
}

/** One row of that list. Mirrors `PasskeySummary` on the server. */
export type PasskeyRow = {
  id: string;
  credentialId: string;
  deviceName: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};
