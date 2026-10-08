import "server-only";

import type { StoredPasskey } from "../store/passkeys";

/**
 * What a browser is told about a passkey.
 *
 * The public key is deliberately absent. It is the console's to hold and to
 * verify with, and a browser that had it could do nothing with it except leak
 * it. The credential id is present because the browser needs it to exclude an
 * authenticator that is already enrolled.
 */
export type PasskeySummary = {
  id: string;
  credentialId: string;
  deviceName: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export function passkeySummary(passkey: StoredPasskey): PasskeySummary {
  return {
    id: passkey.id,
    credentialId: passkey.credentialId,
    deviceName: passkey.deviceName,
    backedUp: passkey.backedUp,
    createdAt: passkey.createdAt.toISOString(),
    lastUsedAt: passkey.lastUsedAt === null ? null : passkey.lastUsedAt.toISOString(),
  };
}
