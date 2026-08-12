// Encrypts issuer signing keys at rest using the server AES-256-GCM key (L5).
// Testnet keys — this is defence-in-depth, not a substitute for an HSM/KMS in production.
import { aesEncrypt, aesDecrypt } from "./crypto.service.js";

/** Encrypt a private key (hex) into a storable string. */
export function encryptKey(privateKeyHex) {
  return JSON.stringify(aesEncrypt(privateKeyHex));
}

/** Decrypt a stored key blob back to the private key hex. */
export function decryptKey(blob) {
  return aesDecrypt(JSON.parse(blob));
}
