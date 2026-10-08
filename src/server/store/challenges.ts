import "server-only";

import type { SqlDriver } from "../db/drivers";
import { newId, readInstant, storedInstant } from "./support";

/**
 * The WebAuthn challenges this console has handed out and not yet seen back.
 *
 * A ceremony is two requests: one asks the console for options carrying a fresh
 * challenge, the other brings the authenticator's answer. The challenge has to be
 * remembered between them, and there is nowhere in the cookie to put it without
 * the browser being able to read or replay one, so it lives here.
 *
 * A challenge is taken rather than read. `takeChallenge` deletes as it answers,
 * so a captured answer cannot be replayed against the same challenge, and the
 * delete is what makes that true rather than a flag someone could forget to set.
 */

export type ChallengeKind = "passkey.register" | "passkey.step-up";

export type TakenChallenge = {
  kind: ChallengeKind;
  challenge: string;
};

type ChallengeRow = {
  kind: string;
  challenge: string;
  expires_at: unknown;
};

/** How long an unanswered ceremony may sit before it is worthless. */
export const CHALLENGE_TTL_MS = 60_000;

/** Records a challenge the browser is about to be given. Returns its id. */
export async function saveChallenge(
  driver: SqlDriver,
  input: { operatorId: string; kind: ChallengeKind; challenge: string; at: Date },
): Promise<string> {
  const id = newId();
  await driver.execute(
    `insert into webauthn_challenges (id, operator_id, kind, challenge, created_at, expires_at)
     values (?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.operatorId,
      input.kind,
      input.challenge,
      storedInstant(driver, input.at),
      storedInstant(driver, new Date(input.at.getTime() + CHALLENGE_TTL_MS)),
    ],
  );

  // Opportunistic hygiene, in the same spirit as the grant prune: an abandoned
  // ceremony leaves a row behind and nothing else would ever collect it.
  await pruneChallenges(driver, input.at);

  return id;
}

/**
 * Takes a challenge, answering with it and deleting it in one statement.
 *
 * Expiry is judged here rather than in the `where`, so an expired challenge is
 * still deleted rather than left to be pruned later. The row comes back either
 * way and the caller decides; what a caller cannot do is ask twice.
 */
export async function takeChallenge(
  driver: SqlDriver,
  input: { id: string; operatorId: string; now: Date },
): Promise<TakenChallenge | null> {
  const rows = await driver.query<ChallengeRow>(
    `delete from webauthn_challenges
      where id = ? and operator_id = ?
      returning kind, challenge, expires_at`,
    [input.id, input.operatorId],
  );

  const row = rows[0];
  if (row === undefined) return null;
  if (readInstant(row.expires_at).getTime() <= input.now.getTime()) return null;

  return { kind: row.kind as ChallengeKind, challenge: row.challenge };
}

/** Drops every challenge that has expired. Best effort, called on the way past. */
export async function pruneChallenges(driver: SqlDriver, now: Date): Promise<void> {
  await driver.execute(`delete from webauthn_challenges where expires_at <= ?`, [
    storedInstant(driver, now),
  ]);
}
