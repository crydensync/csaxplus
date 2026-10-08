import "server-only";

import type { SqlDriver } from "../db/drivers";
import { newId, storedInstant } from "./support";

/**
 * Short-lived proof that an operator stepped up, and what they stepped up for.
 *
 * A grant is what the second request of a two-request operation carries. The
 * console decides at the ceremony that the operator really is who the session
 * says, and then has to let the *next* request, the one that actually removes a
 * passkey, know that. The grant is that fact, written down.
 *
 * Three things bound it, and all three are checked when it is spent: the
 * operator, the session it was earned in, and the purpose it was earned for. A
 * grant for removing a passkey is not a grant for registering one, and a grant
 * earned in one session is worthless in another, so a stolen grant is worth no
 * more than the session that earned it.
 *
 * It is also single-use and short-lived. Consumption is a conditional update, so
 * the database decides which of two simultaneous requests spends it.
 */

/**
 * What a grant can be earned for. A closed set on purpose: a purpose is a thing
 * this console knows how to do, and a typo should be a type error rather than a
 * grant that can never be spent.
 */
export const STEP_UP_PURPOSES = ["passkey.register", "passkey.remove"] as const;

export type StepUpPurpose = (typeof STEP_UP_PURPOSES)[number];

/** How long a grant stays spendable. Long enough to finish a click, no longer. */
export const GRANT_TTL_MS = 20_000;

export function isStepUpPurpose(value: string): value is StepUpPurpose {
  return (STEP_UP_PURPOSES as readonly string[]).includes(value);
}

/** Grants the operator a step-up for one purpose. Returns the id to carry back. */
export async function issueGrant(
  driver: SqlDriver,
  input: {
    operatorId: string;
    sessionId: string;
    purpose: StepUpPurpose;
    at: Date;
  },
): Promise<string> {
  const id = newId();
  await driver.execute(
    `insert into step_up_grants
       (id, operator_id, session_id, purpose, created_at, expires_at, consumed_at)
     values (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.operatorId,
      input.sessionId,
      input.purpose,
      storedInstant(driver, input.at),
      storedInstant(driver, new Date(input.at.getTime() + GRANT_TTL_MS)),
      null,
    ],
  );

  await pruneGrants(driver, input.at);

  return id;
}

/**
 * Spends a grant, answering whether it was still good.
 *
 * Every condition is in the `where`: the operator, the session, the purpose, not
 * already spent, and not expired. The first caller to reach the row consumes it
 * and every later one matches nothing, which is what makes a grant single-use
 * without a lock.
 */
export async function consumeGrant(
  driver: SqlDriver,
  input: {
    id: string;
    operatorId: string;
    sessionId: string;
    purpose: StepUpPurpose;
    now: Date;
  },
): Promise<boolean> {
  const spent = await driver.query<{ id: string }>(
    `update step_up_grants set consumed_at = ?
      where id = ? and operator_id = ? and session_id = ? and purpose = ?
        and consumed_at is null and expires_at > ?
      returning id`,
    [
      storedInstant(driver, input.now),
      input.id,
      input.operatorId,
      input.sessionId,
      input.purpose,
      storedInstant(driver, input.now),
    ],
  );
  return spent.length > 0;
}

/** Drops every grant that has expired or been spent. Best effort. */
export async function pruneGrants(driver: SqlDriver, now: Date): Promise<void> {
  await driver.execute(
    `delete from step_up_grants where expires_at <= ? or consumed_at is not null`,
    [storedInstant(driver, now)],
  );
}
