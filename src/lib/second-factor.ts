/**
 * The second factors CrydenSync can pause a login for.
 *
 * In `lib` rather than beside the API client because the sign-in form, which
 * runs in the browser, has to name them too, and a client component must not
 * reach into a `server-only` module to find out what they are called. The values
 * are the API's (`cryden/auth/login.go`); the labels are the console's.
 */

export const SECOND_FACTOR_METHODS = ["totp", "webauthn", "recovery_code"] as const;

export type SecondFactorMethod = (typeof SECOND_FACTOR_METHODS)[number];

export const SECOND_FACTOR_LABELS: Record<SecondFactorMethod, string> = {
  totp: "Authenticator code",
  webauthn: "Passkey",
  recovery_code: "Recovery code",
};

export function isSecondFactorMethod(value: string): value is SecondFactorMethod {
  return (SECOND_FACTOR_METHODS as readonly string[]).includes(value);
}
