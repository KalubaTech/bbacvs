// Client-side OFFLINE verification — validates a scanned QR's ECDSA signature against a
// locally cached issuer public key, with NO network call at verify time. Mirrors the
// server's signedQr.verifyOffline. Issuer keys are pre-cached while online.
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes, hexToBytes } from "@noble/hashes/utils";
import { api } from "./api";

const CACHE_KEY = "bbacvs_issuer_keys";

/** Fetch issuer keys and cache them (call while online). Returns did→publicKey map. */
export async function syncIssuerKeys() {
  const { keys } = await api.issuerKeys();
  const map = {};
  for (const k of keys) map[k.did] = { publicKey: k.publicKey, institution: k.institution };
  localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), map }));
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

/** did:ethr:0x…#keys-1  →  did:ethr:0x… */
function didFromRef(ref) {
  return String(ref).split("#")[0];
}

function signingMessage(p) {
  return [p.cred_did, p.cid, p.hash8, p.iss_pk_ref, p.iat].join("|");
}

/**
 * Verify a scanned QR payload entirely offline.
 * @returns {{ status: string, institution?: string, reason?: string }}
 */
export function verifyOfflineLocal(payload) {
  const cache = getCachedKeys();
  if (!cache) return { status: "NO_KEYS", reason: "No issuer keys cached — connect once to sync." };

  const did = didFromRef(payload.iss_pk_ref);
  const entry = cache.map[did];
  if (!entry) return { status: "UNKNOWN_ISSUER", reason: "Issuer not in local key cache." };

  try {
    const msgHash = sha256(utf8ToBytes(signingMessage(payload)));
    const ok = secp256k1.verify(
      payload.sig.replace(/^0x/, ""),
      msgHash,
      hexToBytes(entry.publicKey.replace(/^0x/, ""))
    );
    return ok
      ? { status: "OFFLINE_VERIFIED", institution: entry.institution }
      : { status: "INVALID", reason: "Signature does not match issuer key." };
  } catch (e) {
    return { status: "INVALID", reason: e.message };
  }
}
