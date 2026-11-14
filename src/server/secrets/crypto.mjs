import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function vaultKeyID(key) {
  return `sha256:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

export function encryptVaultValue(name, value, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(name, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return { ciphertext: ciphertext.toString("base64"), nonce: nonce.toString("base64") };
}

export function decryptVaultValue(name, ciphertext, nonce, keyID, key) {
  if (keyID !== "v1" && keyID !== vaultKeyID(key)) {
    throw new Error("This secret uses a different vault key. Restore its configured key or run key rotation.");
  }
  const packed = Buffer.from(ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64"));
  decipher.setAAD(Buffer.from(name, "utf8"));
  decipher.setAuthTag(packed.subarray(packed.length - 16));
  return Buffer.concat([decipher.update(packed.subarray(0, -16)), decipher.final()]).toString("utf8");
}
