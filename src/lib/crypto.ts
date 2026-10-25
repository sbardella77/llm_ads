import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY deve essere di 32 byte in base64");
  }
  return key;
}

export function encryptSecret(plaintext: string, base64Key: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

export function decryptSecret(secret: EncryptedSecret, base64Key: string): string {
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(base64Key), secret.iv);
  decipher.setAuthTag(secret.tag);
  return Buffer.concat([decipher.update(secret.ciphertext), decipher.final()]).toString("utf8");
}
