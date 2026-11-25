export function vaultKeyID(key: Uint8Array): string;
export function encryptVaultValue(
  name: string,
  value: string,
  key: Uint8Array,
): { ciphertext: string; nonce: string };
export function decryptVaultValue(
  name: string,
  ciphertext: string,
  nonce: string,
  keyID: string,
  key: Uint8Array,
): string;
