import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

import { CSRF_HEADER } from "./csrf-header";

/**
 * The browser half of enrolling a passkey, and the console's own routes.
 *
 * The credential is the operator's at the API, not the console's, so the console
 * relays: it asks its own route for the options, hands them to the authenticator,
 * and gives the answer back to be forwarded. Nothing here decides whether the
 * enrolment was acceptable. The API does, and its refusal arrives carrying the
 * API's code, so a screen can tell "your password was wrong" apart from "that did
 * not work, try again" rather than showing one sentence for both.
 *
 * Every call carries the session's CSRF token, because the routes behind them run
 * the mutation guard and it refuses a request without one. The token is a required
 * argument rather than something read from a cookie here: the cookie is httpOnly,
 * which is the whole point of the double-submit check, so the value can only reach
 * this file from the server component that rendered the screen.
 */

/** The code the console uses when it could not be reached at all. */
export const CONSOLE_UNREACHABLE = "console_unreachable";

/** Why an enrolment did not finish, as much as the browser can tell. */
export type PasskeyRefusal = {
  /** The console's or the API's error code, or null when neither answered. */
  code: string | null;
  message: string;
  /**
   * True when the ceremony never left the browser: the operator dismissed the
   * prompt, or this browser has no WebAuthn. Nothing was attempted and nothing
   * needs reporting as a fault.
   */
  dismissed: boolean;
};

export type PasskeyResult<T> = { ok: true; value: T } | { ok: false; refusal: PasskeyRefusal };

/** One row of the list, as `GET /api/console/passkeys` describes it. */
export type PasskeyRow = {
  credential_id: string;
  nickname: string;
  created_at: string;
  last_used_at?: string;
};

function refusal(code: string | null, message: string, dismissed = false): PasskeyRefusal {
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
 * Read by name rather than by class: the WebAuthn library's errors are structural,
 * and a `DOMException` from the platform takes the same path.
 */
function isCancellation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === "NotAllowedError" || name === "AbortError";
}

/**
 * What the platform throws when this authenticator already holds a credential for
 * the account.
 *
 * Kept apart from a cancellation because it is not one, and saying so would be
 * wrong in the way that costs the operator time: a platform key refuses to enrol
 * the same account twice, so the fix is another device or removing the key that is
 * already there, not trying again.
 */
function isAlreadyRegistered(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "InvalidStateError"
  );
}

/** The console's error envelope, read without assuming it is one. */
function refusalFrom(payload: unknown, status: number): PasskeyRefusal {
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
 * trace, so a network that never answered, a body that is not the envelope and an
 * outright refusal all come back as refusals with different codes.
 */
async function call<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  options: { body?: unknown; csrf?: string } = {},
): Promise<PasskeyResult<T>> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("content-type", "application/json");
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

/** The operator's own passkeys, as the console's list route describes them. */
export function listPasskeys(): Promise<PasskeyResult<{ passkeys: PasskeyRow[] }>> {
  return call("GET", "/api/console/passkeys");
}

/**
 * Enrols a new passkey.
 *
 * Two calls, because the ceremony has two halves and the second cannot start
 * before the first has answered. The options come from the console's route, which
 * got them from the API; the answer goes back the same way. The ceremony token
 * ties the two together and is opaque here: it is passed through untouched, which
 * is what the API requires of it.
 */
export async function addPasskey(input: {
  nickname: string;
  csrf: string;
}): Promise<PasskeyResult<{ enrolled: true }>> {
  const offered = await call<{
    options: PublicKeyCredentialCreationOptionsJSON;
    ceremonyToken: string;
  }>("POST", "/api/console/passkeys/options", { body: {}, csrf: input.csrf });
  if (!offered.ok) return offered;

  let answer: RegistrationResponseJSON;
  try {
    answer = await startRegistration({ optionsJSON: offered.value.options });
  } catch (error) {
    if (isCancellation(error)) {
      return {
        ok: false,
        refusal: refusal(null, "That was cancelled, so no passkey was added.", true),
      };
    }
    if (isAlreadyRegistered(error)) {
      return {
        ok: false,
        refusal: refusal(
          null,
          "This device already holds a passkey for your account. Use another device, or remove the one you have first.",
        ),
      };
    }
    // Something else the authenticator or the browser threw. It never became a
    // request, so there is no answer to report and nothing was changed.
    return {
      ok: false,
      refusal: refusal(null, "Your authenticator could not complete that. Try again."),
    };
  }

  return call("POST", "/api/console/passkeys", {
    body: {
      ceremonyToken: offered.value.ceremonyToken,
      nickname: input.nickname,
      credential: answer,
    },
    csrf: input.csrf,
  });
}

/**
 * Removes one of the operator's passkeys.
 *
 * The password is sent because the API asks for it, not because this console
 * wants it: it is re-confirmation, the same idea as the step-up prompt the console
 * used to run, except that the API is the one that checks it. It travels in this
 * request's body and nowhere else.
 */
export function removePasskey(input: {
  credentialId: string;
  password: string;
  csrf: string;
}): Promise<PasskeyResult<{ removed: true }>> {
  return call("DELETE", `/api/console/passkeys/${encodeURIComponent(input.credentialId)}`, {
    body: { password: input.password },
    csrf: input.csrf,
  });
}
