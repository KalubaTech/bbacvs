// Security layers L1 (SHA-256) and L5 (AES-256-GCM).
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { config } from "../config/index.js";

/**
 * Canonical SHA-256 hash of a VC document.
 * NOTE: production should canonicalise JSON-LD per RFC 8785 before hashing so that
 * semantically-equal documents hash identically. Stub uses JSON.stringify for now.
 */
export function sha256(input) {
  const data = typeof input === "string" ? input : JSON.stringify(input);
  return "0x" + createHash("sha256").update(data).digest("hex");
}

/** First 8 bytes of the SHA-256 hash — the QR "hash8" integrity fragment. */
export function hashFragment(fullHash) {
  return fullHash.replace(/^0x/, "").slice(0, 16); // 8 bytes = 16 hex chars
}

function aesKey() {
  const key = Buffer.from(config.aesKey, "hex");
  if (key.length !== 32) {
    throw new Error("AES_256_KEY must be 32 bytes (64 hex chars)");
  }
  return key;
}

/** AES-256-GCM encrypt a VC payload before IPFS upload. Per-credential random IV. */
export function aesEncrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(), iv);
  const data = typeof plaintext === "string" ? plaintext : JSON.stringify(plaintext);
  const ciphertext = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    ciphertext: ciphertext.toString("base64"),
  };
}

/** AES-256-GCM decrypt. Throws if the auth tag fails (tamper detection). */
export function aesDecrypt({ iv, tag, ciphertext }) {
  const decipher = createDecipheriv("aes-256-gcm", aesKey(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
