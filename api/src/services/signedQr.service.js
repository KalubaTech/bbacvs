// Security layers L2/L6 — the cloning-resistant, offline-verifiable signed QR payload.
//
// Schema v2 (current, D03): { v: 2, typ, hash, cid, cred_did, iss_pk_ref, iat, sig }. The
// signature covers the RFC 8785 canonical JSON of EVERY field except `sig`, so the full
// credential reference (`hash`), the CID and the issuer key reference are all bound — changing
// any of them invalidates the QR.
//
// Legacy v1 (no `v`, Figure 3.10): signs only cred_did|cid|hash8|iss_pk_ref|iat; the full `hash`
// was appended after signing. Legacy QRs are accepted only when the unsigned `hash` agrees with
// the signed 8-byte `hash8` fragment (see checkQrReference), and the stored QR of every credential
// is re-signed as v2 the next time it is served, so only already-printed copies stay legacy.
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";
import { utf8ToBytes, bytesToHex, hexToBytes } from "@noble/hashes/utils";
import QRCode from "qrcode";
import { canonicalize } from "../utils/canonicalJson.js";
import { hashFragment } from "./crypto.service.js";

export const QR_VERSION = 2;
export const CREDENTIAL_QR_TYPE = "bbacvs-credential";

/** The exact bytes that get signed, by schema version. */
export function signingMessage(p) {
  if (p.v === QR_VERSION) {
    const { sig, ...signed } = p;
    return canonicalize(signed);
  }
  return [p.cred_did, p.cid, p.hash8, p.iss_pk_ref, p.iat].join("|");
}

/**
 * Build and ECDSA-sign (secp256k1) a v2 QR payload. Every field passed in is signed.
 * @param {object} fields e.g. typ, hash, cid, cred_did, iss_pk_ref, iat
 * @param {string} privKeyHex issuer secp256k1 private key (hex, 0x optional)
 */
export function buildSignedPayload(fields, privKeyHex) {
  const payload = { v: QR_VERSION, ...fields };
  const msgHash = nobleSha256(utf8ToBytes(signingMessage(payload)));
  const sig = secp256k1.sign(msgHash, hexToBytes(privKeyHex.replace(/^0x/, "")));
  return { ...payload, sig: "0x" + sig.toDERHex() };
}

/** Signed v2 credential QR for an issued credential. */
export function buildCredentialQr({ credentialHash, cid, holderDID, issuerDID, iat }, privKeyHex) {
  return buildSignedPayload({
    typ: CREDENTIAL_QR_TYPE,
    hash: credentialHash,
    cid,
    cred_did: holderDID,
    iss_pk_ref: `${issuerDID}#keys-1`,
    iat: iat ?? Math.floor(Date.now() / 1000),
  }, privKeyHex);
}

/**
 * Offline verification: validate the embedded ECDSA signature against a
 * (cached) issuer public key. No network access required.
 * @returns {boolean}
 */
export function verifyOffline(payload, issuerPubKeyHex) {
  try {
    const msgHash = nobleSha256(utf8ToBytes(signingMessage(payload)));
    const sigBytes = payload.sig.replace(/^0x/, "");
    const pubKey = hexToBytes(issuerPubKeyHex.replace(/^0x/, ""));
    return secp256k1.verify(sigBytes, msgHash, pubKey);
  } catch {
    return false;
  }
}

/**
 * Which credential reference a (signature-verified) QR vouches for.
 * v2: the signed `hash`. Legacy: the unsigned `hash`, accepted only if it matches the signed
 * `hash8` fragment.
 * @returns {{ ok: boolean, hash?: string, legacy: boolean, reason?: string }}
 */
export function checkQrReference(payload) {
  const legacy = payload?.v !== QR_VERSION;
  const hash = payload?.hash;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash || "")) {
    return { ok: false, legacy, reason: "QR carries no full credential reference" };
  }
  if (legacy && hashFragment(hash) !== String(payload.hash8 || "").toLowerCase()) {
    return { ok: false, legacy, reason: "Credential reference does not match the signed fragment" };
  }
  return { ok: true, hash, legacy };
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
