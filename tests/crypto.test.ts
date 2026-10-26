import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/lib/crypto";

const key = randomBytes(32).toString("base64");

describe("crypto", () => {
  it("cifra e decifra una API key", () => {
    const enc = encryptSecret("sk-ads-123", key);
    expect(enc.ciphertext.toString("utf8")).not.toContain("sk-ads-123");
    expect(decryptSecret(enc, key)).toBe("sk-ads-123");
  });

  it("rifiuta una chiave sbagliata", () => {
    const enc = encryptSecret("sk-ads-123", key);
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"))).toThrow();
  });
});
