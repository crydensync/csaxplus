import "server-only";

import { createHash } from "node:crypto";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  VerifiedRegistrationResponse,
} from "@simplewebauthn/server";

import { getConfig } from "../config/index";
import type { SqlDriver } from "../db/drivers";
import { saveChallenge, takeChallenge } from "../store/challenges";
import {
  findPasskeyByCredentialId,
  insertPasskey,
  listPasskeys,
  recordPasskeyUse,
  type StoredPasskey,
} from "../store/passkeys";

/**
 * The two WebAuthn ceremonies this console runs, and the checks it makes on the
 * answers.
 *
 * The API has no step-up check of its own, so the console keeps its own second
 * factor and this is where it is verified (BUILD_NOTE sections 5 and 11.2). A
 * ceremony is two requests: one asks for options, the other brings back what the
 * authenticator produced. The challenge that ties them together is stored by
 * `store/challenges.ts` and spent when the second request arrives.
 *
 * Everything the specification leaves to the relying party to decide is decided
 * here, and each decision is a refusal rather than a warning:
 *
 * - user verification is required, not preferred. A passkey that was only
 *   present, never unlocked, is not a second factor.
 * - the origin and the RP ID must be the configured ones.
 * - a credential must be one this console enrolled, and it must belong to the
 *   operator the session names.
 * - a signature counter that fails to advance is a clone, and the library
 *   refuses it rather than this module remembering to.
 *
 * Nothing here decides *whether* an operation may proceed. That is the grant, in
 * `store/grants.ts`, and it is issued only once a ceremony has passed.
 */

/** Why a ceremony did not complete. Each maps to one thing to say on screen. */
export type CeremonyFailure =
  | "challenge" // unknown, already spent, or past its minute
  | "challenge-kind" // a registration challenge brought to a step-up, or the reverse
  | "verification" // the authenticator's answer did not check out
  | "credential-unknown" // a credential this console never enrolled
  | "credential-owner" // someone else's credential
  | "no-passkey"; // nothing to step up with

export class CeremonyError extends Error {
  readonly failure: CeremonyFailure;

  constructor(failure: CeremonyFailure, message: string, options: { cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "CeremonyError";
    this.failure = failure;
  }
}

export type RegistrationOffer = {
  /** Carry this back with the authenticator's answer. */
  challengeId: string;
  options: PublicKeyCredentialCreationOptionsJSON;
};

export type StepUpOffer = {
  challengeId: string;
  options: PublicKeyCredentialRequestOptionsJSON;
};

/**
 * The WebAuthn user handle for an operator.
 *
 * Hashed rather than used directly because the specification caps the handle at
 * 64 bytes and the API's operator id is whatever the engine chose. A digest is
 * always 32 bytes, and it is stable for a given operator, which is all the
 * handle has to be: the authenticator stores it to tell one account from another
 * on the same device.
 */
function userHandle(operatorId: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash("sha256").update(operatorId).digest());
}

/**
 * A byte array the WebAuthn library will accept.
 *
 * The library types every key it is handed as `Uint8Array<ArrayBuffer>`, which
 * is narrower than the `Uint8Array<ArrayBufferLike>` this console's store uses,
 * and the difference is not cosmetic: a `Buffer` from `node:crypto` is backed by
 * a shared pool, so its `.buffer` is not its own bytes. Copying into a fresh
 * array is what makes the two views the same thing, where a cast would only
 * claim they were.
 */
function libraryBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

/**
 * Asks for the options that enrol a new passkey.
 *
 * Credentials the operator already holds are excluded, so an authenticator that
 * is already enrolled is not enrolled a second time. The unique index on the
 * credential id would refuse that anyway; this is the version that says so
 * before the operator has touched their key.
 */
export async function beginRegistration(
  driver: SqlDriver,
  input: { operatorId: string; label: string; at: Date },
): Promise<RegistrationOffer> {
  const { webauthn } = getConfig();
  const existing = await listPasskeys(driver, input.operatorId);

  const options = await generateRegistrationOptions({
    rpID: webauthn.rpId,
    rpName: webauthn.rpName,
    userID: userHandle(input.operatorId),
    userName: input.label,
    userDisplayName: input.label,
    attestationType: "none",
    excludeCredentials: existing.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports,
    })),
    // Required, not preferred: the point of this passkey is that it verifies the
    // person, and a "preferred" authenticator is free to skip that.
    authenticatorSelection: { userVerification: "required", residentKey: "preferred" },
  });

  const challengeId = await saveChallenge(driver, {
    operatorId: input.operatorId,
    kind: "passkey.register",
    challenge: options.challenge,
    at: input.at,
  });

  return { challengeId, options };
}

/**
 * Checks an authenticator's new credential and stores it.
 *
 * `deviceName` is what the operator called the key, and is theirs to choose: an
 * authenticator does not report one, and "the key in the drawer" is what makes a
 * list of three of them usable.
 */
export async function finishRegistration(
  driver: SqlDriver,
  input: {
    operatorId: string;
    challengeId: string;
    response: RegistrationResponseJSON;
    deviceName: string;
    at: Date;
  },
): Promise<StoredPasskey> {
  const { webauthn } = getConfig();

  const challenge = await takeChallenge(driver, {
    id: input.challengeId,
    operatorId: input.operatorId,
    now: input.at,
  });
  if (challenge === null) {
    throw new CeremonyError("challenge", "that registration has expired; start it again");
  }
  if (challenge.kind !== "passkey.register") {
    throw new CeremonyError("challenge-kind", "that challenge was not for registering a passkey");
  }

  // Wrapped, because a malformed answer makes the library throw rather than
  // answer false, and an authenticator's output is untrusted input: a broken
  // client should get a refusal, not a 500.
  let verification: VerifiedRegistrationResponse;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: webauthn.origin,
      expectedRPID: webauthn.rpId,
      requireUserVerification: true,
    });
  } catch (cause) {
    throw new CeremonyError("verification", "the authenticator's answer could not be verified", {
      cause,
    });
  }

  if (!verification.verified) {
    throw new CeremonyError("verification", "the authenticator's answer could not be verified");
  }

  const { credential, credentialBackedUp } = verification.registrationInfo;

  return insertPasskey(driver, {
    operatorId: input.operatorId,
    credentialId: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports ?? [],
    deviceName: input.deviceName,
    backedUp: credentialBackedUp,
    at: input.at,
  });
}

/**
 * Asks for the options that prove an operator is present at their key.
 *
 * The credentials offered are the ones this operator enrolled, so the browser
 * prompts for a key that this console could actually verify. An operator with
 * none is refused here rather than being sent to a prompt with nothing in it.
 */
export async function beginStepUp(
  driver: SqlDriver,
  input: { operatorId: string; at: Date },
): Promise<StepUpOffer> {
  const { webauthn } = getConfig();
  const held = await listPasskeys(driver, input.operatorId);

  if (held.length === 0) {
    throw new CeremonyError("no-passkey", "this operator has no step-up passkey yet");
  }

  const options = await generateAuthenticationOptions({
    rpID: webauthn.rpId,
    allowCredentials: held.map((passkey) => ({
      id: passkey.credentialId,
      transports: passkey.transports,
    })),
    userVerification: "required",
  });

  const challengeId = await saveChallenge(driver, {
    operatorId: input.operatorId,
    kind: "passkey.step-up",
    challenge: options.challenge,
    at: input.at,
  });

  return { challengeId, options };
}

/**
 * Checks a step-up answer and reports which credential gave it.
 *
 * Answers with the passkey that was used so the caller can record it. This is
 * the verification alone: what the operator may then do is the grant, and the
 * caller issues that so the purpose and the session are the caller's to name.
 */
export async function finishStepUp(
  driver: SqlDriver,
  input: {
    operatorId: string;
    challengeId: string;
    response: AuthenticationResponseJSON;
    at: Date;
  },
): Promise<StoredPasskey> {
  const { webauthn } = getConfig();

  const challenge = await takeChallenge(driver, {
    id: input.challengeId,
    operatorId: input.operatorId,
    now: input.at,
  });
  if (challenge === null) {
    throw new CeremonyError("challenge", "that step-up has expired; start it again");
  }
  if (challenge.kind !== "passkey.step-up") {
    throw new CeremonyError("challenge-kind", "that challenge was not for a step-up");
  }

  const passkey = await findPasskeyByCredentialId(driver, input.response.id);
  if (passkey === null) {
    throw new CeremonyError("credential-unknown", "that passkey is not one this console enrolled");
  }
  if (passkey.operatorId !== input.operatorId) {
    // The credential exists, but it is not this operator's, so the answer is the
    // same refusal as an unknown one would get. Which operator holds it is not
    // something to report back.
    throw new CeremonyError("credential-owner", "that passkey is not one this console enrolled");
  }

  let verified: boolean;
  let newCounter: number;
  try {
    const verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: webauthn.origin,
      expectedRPID: webauthn.rpId,
      credential: {
        id: passkey.credentialId,
        publicKey: libraryBytes(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports,
      },
      requireUserVerification: true,
    });
    verified = verification.verified;
    // A counter that failed to advance is a clone, and the library throws rather
    // than answering false. Either way the step-up does not happen.
    newCounter = verification.authenticationInfo.newCounter;
  } catch (cause) {
    throw new CeremonyError("verification", "the authenticator's answer could not be verified", {
      cause,
    });
  }

  if (!verified) {
    throw new CeremonyError("verification", "the authenticator's answer could not be verified");
  }

  await recordPasskeyUse(driver, passkey.id, newCounter, input.at);

  return { ...passkey, counter: newCounter, lastUsedAt: input.at };
}
