// Security layers L2/L6 — the cloning-resistant, offline-verifiable signed QR payload.
// Six fields per Figure 3.10: cred_did, cid, hash8, iss_pk_ref, iat, sig.
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";
import { utf8ToBytes, bytesToHex, hexToBytes } from "@noble/hashes/utils";
import QRCode from "qrcode";

/** Canonical message that gets signed: cred_did | cid | hash8 | iss_pk_ref | iat */
function signingMessage(p) {
  return [p.cred_did, p.cid, p.hash8, p.iss_pk_ref, p.iat].join("|");
}

/**
 * Build and ECDSA-sign (secp256k1) the 6-field QR payload.
 * @param {object} fields cred_did, cid, hash8, iss_pk_ref, iat
 * @param {string} privKeyHex issuer secp256k1 private key (hex, no 0x)
 */
export function buildSignedPayload(fields, privKeyHex) {
  const msgHash = nobleSha256(utf8ToBytes(signingMessage(fields)));
  const sig = secp256k1.sign(msgHash, hexToBytes(privKeyHex.replace(/^0x/, "")));
  return { ...fields, sig: "0x" + sig.toDERHex() };
}

/**
 * Offline verification: validate the embedded ECDSA signature against a
 * (cached) issuer public key. No network access required.
 * @returns {boolean}
 */
export function verifyOffline(payload, issuerPubKeyHex) {
  try {
    const { sig, ...fields } = payload;
    const msgHash = nobleSha256(utf8ToBytes(signingMessage(fields)));
    const sigBytes = sig.replace(/^0x/, "");
    const pubKey = hexToBytes(issuerPubKeyHex.replace(/^0x/, ""));
    return secp256k1.verify(sigBytes, msgHash, pubKey);
  } catch {
    return false;
  }
}

/** Derive the compressed public key (hex) for an issuer private key. */
export function publicKeyFor(privKeyHex) {
  return bytesToHex(secp256k1.getPublicKey(hexToBytes(privKeyHex.replace(/^0x/, "")), true));
}

/** Encode the signed payload into a base64 QR data-URL (PNG). */
export async function renderQR(payload) {
  // Encode the JSON directly (no base64 wrapper — that only inflates QR density and made
  // the code too dense for webcams). Low error-correction + high pixel resolution so it
  // scans easily from a screen or print.
  return QRCode.toDataURL(JSON.stringify(payload), {
    errorCorrectionLevel: "L",
    margin: 2,
    width: 512,
  });
}

/** Decode a scanned QR string back into a payload object (raw JSON, base64 fallback). */
export function decodeQR(scanned) {
  try { return JSON.parse(scanned); } catch {}
  return JSON.parse(Buffer.from(scanned, "base64").toString("utf8"));
}
