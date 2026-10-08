import "server-only";

import type { SqlDriver } from "../db/drivers";
import {
  newId,
  readBoolean,
  readInstant,
  readJson,
  readOptionalInstant,
  storedBoolean,
  storedInstant,
  storedJson,
} from "./support";

/**
 * The step-up passkeys this console holds for an operator.
 *
 * These are the console's own, not the engine's: the API has no step-up check,
 * so the console keeps a second factor of its own for the operations it decides
 * are worth one (BUILD_NOTE section 5). A passkey here has nothing to do with
 * the passkeys an operator may have registered with the engine, which this
 * console never sees.
 *
 * Written once against `SqlDriver`, so both dialects run the same statements.
 */

export type StoredPasskey = {
  id: string;
  operatorId: string;
  /** The credential id the authenticator knows, base64url. */
  credentialId: string;
  /** The COSE public key, as the verifier wants it back. */
  publicKey: Uint8Array;
  /** The signature counter as last seen, for clone detection. */
  counter: number;
  transports: string[];
  deviceName: string;
  /** Whether the authenticator is synced (a platform passkey rather than a key). */
  backedUp: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export type NewPasskey = {
  operatorId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  deviceName: string;
  backedUp: boolean;
  at: Date;
};

type PasskeyRow = {
  id: string;
  operator_id: string;
  credential_id: string;
  public_key: string;
  counter: unknown;
  transports: unknown;
  device_name: string;
  backed_up: unknown;
  created_at: unknown;
  last_used_at: unknown;
};

const COLUMNS = `id, operator_id, credential_id, public_key, counter,
                 transports, device_name, backed_up, created_at, last_used_at`;

function toPasskey(row: PasskeyRow): StoredPasskey {
  return {
    id: row.id,
    operatorId: row.operator_id,
    credentialId: row.credential_id,
    publicKey: Buffer.from(row.public_key, "base64url"),
    counter: Number(row.counter),
    transports: readJson<string[]>(row.transports),
    deviceName: row.device_name,
    backedUp: readBoolean(row.backed_up),
    createdAt: readInstant(row.created_at),
    lastUsedAt: readOptionalInstant(row.last_used_at),
  };
}

/**
 * Every passkey this operator has registered with the console, oldest first.
 *
 * Ordered by the id as well as the time. A timestamp has millisecond resolution
 * on both engines, so two registrations can share one, and without the tie-break
 * the row order would be whatever the engine felt like and a list could reshuffle
 * itself between two reads. The order the tie-break gives is arbitrary; that it
 * stays put is not.
 */
export async function listPasskeys(
  driver: SqlDriver,
  operatorId: string,
): Promise<StoredPasskey[]> {
  const rows = await driver.query<PasskeyRow>(
    `select ${COLUMNS} from operator_passkeys where operator_id = ? order by created_at, id`,
    [operatorId],
  );
  return rows.map(toPasskey);
}

/** How many the operator holds, which is what the last-one rule turns on. */
export async function countPasskeys(driver: SqlDriver, operatorId: string): Promise<number> {
  const rows = await driver.query<{ total: unknown }>(
    `select count(*) as total from operator_passkeys where operator_id = ?`,
    [operatorId],
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Looks a credential up by its id, across every operator.
 *
 * Not scoped to an operator on purpose: the credential id arrives from the
 * authenticator before the console knows whose it is, and the caller checks the
 * operator it came back with. Two tables disagreeing about credential ids would
 * be worse than this one lookup.
 */
export async function findPasskeyByCredentialId(
  driver: SqlDriver,
  credentialId: string,
): Promise<StoredPasskey | null> {
  const rows = await driver.query<PasskeyRow>(
    `select ${COLUMNS} from operator_passkeys where credential_id = ?`,
    [credentialId],
  );
  return rows.length === 0 ? null : toPasskey(rows[0] as PasskeyRow);
}

/** Stores a newly registered passkey and returns it as it was written. */
export async function insertPasskey(
  driver: SqlDriver,
  passkey: NewPasskey,
): Promise<StoredPasskey> {
  const id = newId();
  await driver.execute(
    `insert into operator_passkeys
       (id, operator_id, credential_id, public_key, counter, transports,
        device_name, backed_up, created_at, last_used_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      passkey.operatorId,
      passkey.credentialId,
      Buffer.from(passkey.publicKey).toString("base64url"),
      passkey.counter,
      storedJson(passkey.transports),
      passkey.deviceName,
      storedBoolean(driver, passkey.backedUp),
      storedInstant(driver, passkey.at),
      null,
    ],
  );

  return {
    id,
    operatorId: passkey.operatorId,
    credentialId: passkey.credentialId,
    publicKey: passkey.publicKey,
    counter: passkey.counter,
    transports: passkey.transports,
    deviceName: passkey.deviceName,
    backedUp: passkey.backedUp,
    createdAt: passkey.at,
    lastUsedAt: null,
  };
}

/**
 * Removes a passkey, refusing to remove an operator's last one.
 *
 * The refusal is in the statement rather than in a check before it. An operator
 * with no step-up passkey cannot step up, and every operation that needs one
 * would be permanently out of reach, so this is the rule that keeps the console
 * usable. A read-then-delete would let two requests each see two passkeys and
 * each remove one.
 *
 * Answers whether a row went, which is false both for a passkey this operator
 * does not hold and for the last one they do. The caller tells those apart with
 * `countPasskeys` if it needs to word the refusal.
 */
export async function deletePasskey(
  driver: SqlDriver,
  operatorId: string,
  id: string,
): Promise<boolean> {
  const removed = await driver.query<{ id: string }>(
    `delete from operator_passkeys
      where id = ? and operator_id = ?
        and (select count(*) from operator_passkeys where operator_id = ?) > 1
      returning id`,
    [id, operatorId, operatorId],
  );
  return removed.length > 0;
}

/**
 * Records that a credential was just used: its new counter and the time.
 *
 * The counter is what makes a cloned authenticator visible. WebAuthn lets a
 * verifier refuse a signature whose counter did not advance, and this is where
 * the advanced value is kept.
 */
export async function recordPasskeyUse(
  driver: SqlDriver,
  id: string,
  counter: number,
  at: Date,
): Promise<void> {
  await driver.execute(
    `update operator_passkeys set counter = ?, last_used_at = ? where id = ?`,
    [counter, storedInstant(driver, at), id],
  );
}
