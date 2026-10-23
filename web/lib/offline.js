// Client-side OFFLINE verification — validates a scanned QR's ECDSA signature against a
// locally cached issuer public key, with NO network call at verify time. Mirrors the
// server's signedQr.verifyOffline. Issuer keys are pre-cached while online.
//
// What an offline result can and cannot say (D06): a valid signature proves which issuer signed
// the QR and that it is unaltered. It cannot prove the credential is still valid — revocation,
// suspension and the issuer's current authorisation need the online check. Results are therefore
// reported as "signature only", together with how old the cached key set is, where it came
// from, and whether it has expired.
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes, hexToBytes } from "@noble/hashes/utils";
import { api } from "./api";
import { canonicalize } from "./canonicalJson";

const CACHE_KEY = "bbacvs_issuer_keys";
const DEFAULT_MAX_AGE_S = 7 * 24 * 3600;

/** Fetch issuer keys and cache them (call while online). Returns did→entry map. */
export async function syncIssuerKeys() {
  const res = await api.issuerKeys();
  const map = {};
  for (const k of res.keys) map[k.did] = { publicKey: k.publicKey, institution: k.institution };
  const cache = {
    at: Date.now(),
    generatedAt: res.generatedAt || new Date().toISOString(),
    maxAgeSeconds: res.maxAgeSeconds || DEFAULT_MAX_AGE_S,
    source: `${res.source || "BBACVS trusted-issuer registry"} (${window.location.host})`,
    map,
  };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* storage unavailable */ }
  return map;
}

export function getCachedKeys() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    return c ? c : null;
  } catch {
    return null;
  }
}

/** Age / expiry / provenance of the cached key set. */
export function cacheInfo(cache = getCachedKeys(), now = Date.now()) {
  if (!cache) return null;
  const maxAgeMs = (cache.maxAgeSeconds || DEFAULT_MAX_AGE_S) * 1000;
  return {
    cachedAt: cache.at,
    ageMs: now - cache.at,
    expiresAt: cache.at + maxAgeMs,
    expired: now - cache.at > maxAgeMs,
    source: cache.source || "BBACVS trusted-issuer registry",
  };
}

/** did:ethr:0x…#keys-1  →  did:ethr:0x… */
function didFromRef(ref) {
  return String(ref).split("#")[0];
}

// Must match api/src/services/signedQr.service.js signingMessage(): v2 signs the canonical
// JSON of every field except `sig`; legacy v1 signed five pipe-joined fields.
function signingMessage(p) {
  if (p.v === 2) {
    const { sig, ...signed } = p;
    return canonicalize(signed);
  }
  return [p.cred_did, p.cid, p.hash8, p.iss_pk_ref, p.iat].join("|");
}

/**
 * Verify a scanned QR payload entirely offline.
 * @returns {{ status: string, institution?: string, reason?: string, cache?: object, legacy?: boolean }}
 *   status: SIGNATURE_ONLY (valid, fresh keys) | SIGNATURE_ONLY_STALE (valid, expired keys)
 *           | INVALID | UNKNOWN_ISSUER | NO_KEYS
 */
export function verifyOfflineLocal(payload) {
  const cache = getCachedKeys();
  if (!cache) return { status: "NO_KEYS", reason: "No issuer keys cached — connect once to sync." };
  const info = cacheInfo(cache);

  const did = didFromRef(payload.iss_pk_ref);
  const entry = cache.map[did];
  if (!entry) return { status: "UNKNOWN_ISSUER", reason: "Issuer not in local key cache.", cache: info };

  try {
    const msgHash = sha256(utf8ToBytes(signingMessage(payload)));
    const ok = secp256k1.verify(
      payload.sig.replace(/^0x/, ""),
      msgHash,
      hexToBytes(entry.publicKey.replace(/^0x/, ""))
    );
    if (!ok) return { status: "INVALID", reason: "Signature does not match issuer key.", cache: info };
    return {
      status: info.expired ? "SIGNATURE_ONLY_STALE" : "SIGNATURE_ONLY",
      institution: entry.institution,
      legacy: payload.v !== 2,
      cache: info,
    };
  } catch (e) {
    return { status: "INVALID", reason: e.message, cache: info };
  }
}
