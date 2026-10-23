// Online content-integrity verification (D02). "Verified" must mean the credential CONTENT is
// intact and was signed by the issuer that anchored it — not merely that a hash exists on-chain.
//
// Chain of checks (each recorded as evidence in `checks`):
//   1. cid_commitment  keccak256(CID) equals the cidHash anchored on-chain
//   2. retrieval       the encrypted VC can be fetched from IPFS          (fails → unavailable)
//   3. decryption      AES-256-GCM authenticates and decrypts it
//   4. digest          the recomputed credential digest equals the anchored hash
//   5. issuer_key      the issuer's public key derives to the on-chain issuer address
//   6. vc_issuer       the VC names that issuer's DID
//   7. vc_signature    the VC proof verifies under that key
//   8. index_match     the off-chain index (what verifiers are shown) matches the VC claims
// Result status: verified | tampered | untrusted | unavailable.
import { ethers } from "ethers";
import { fetchByCid } from "./ipfs.service.js";
import { aesDecrypt, credentialDigest, sha256, LEGACY_HASH_VERSION } from "./crypto.service.js";
import { verifyCredential } from "./vc.service.js";
import { normaliseNationalId } from "../utils/nationalId.js";

const FETCH_TIMEOUT_MS = 15000;

// Encrypted payloads by CID. Safe to cache: every verification still decrypts, recomputes the
// digest and checks it against the chain, so a cached copy cannot make bad content pass.
const cache = new Map();
const CACHE_MAX = 500;

async function fetchEncrypted(cid, fetcher) {
  if (cache.has(cid)) return cache.get(cid);
  let timer;
  const data = await Promise.race([
    fetcher(cid),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("IPFS fetch timed out")), FETCH_TIMEOUT_MS); }),
  ]).finally(() => clearTimeout(timer));
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(cid, data);
  return data;
}

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** Fields shown to verifiers that must agree with the signed VC. */
function indexMismatches(meta, subject) {
  const out = [];
  if (!same(meta.subjectName, subject.name)) out.push("name");
  if (!same(meta.qualification, subject.qualification)) out.push("qualification");
  if (String(meta.graduationYear ?? "") !== String(subject.graduationYear ?? "")) out.push("graduationYear");
  if ((normaliseNationalId(meta.holderNationalId) || "") !== (normaliseNationalId(subject.nationalId) || "")) out.push("nationalId");
  if (meta.holderDID && subject.id && meta.holderDID !== subject.id) out.push("holder");
  return out;
}

/**
 * @param {object} p
 * @param {string} p.credentialHash anchored hash
 * @param {object} p.onchain         verifyOnChain() result (issuer, cidHash)
 * @param {object|null} p.meta       CredentialIndex row (cid, hashVersion, displayed fields)
 * @param {object|null} p.issuer     Issuer row whose walletAddress is the on-chain issuer
 * @param {Function} [p.fetcher]     CID → encrypted payload (injectable for tests)
 * @returns {Promise<{status: string, reason?: string, checks: object[], subject?: object}>}
 */
export async function checkIntegrity({ credentialHash, onchain, meta, issuer, fetcher = fetchByCid }) {
  const checks = [];
  const pass = (id, detail) => checks.push({ id, ok: true, detail });
  const fail = (status, id, detail) => {
    checks.push({ id, ok: false, detail });
    return { status, reason: detail, checks };
  };

  const cid = meta?.cid;
  if (!cid) return fail("unavailable", "cid_commitment", "No off-chain record holds the CID for this anchor");
  if (ethers.keccak256(ethers.toUtf8Bytes(cid)) !== onchain.cidHash) {
    return fail("tampered", "cid_commitment", "The stored CID does not match the CID commitment anchored on-chain");
  }
  pass("cid_commitment", "CID matches the on-chain commitment");

  let encrypted;
  try {
    encrypted = await fetchEncrypted(cid, fetcher);
  } catch (err) {
    return fail("unavailable", "retrieval", `Encrypted credential could not be retrieved from IPFS (${err.message})`);
  }
  pass("retrieval", "Encrypted credential retrieved from IPFS");

  let plaintext, vc;
  try {
    plaintext = aesDecrypt(encrypted);
    vc = JSON.parse(plaintext);
  } catch {
    return fail("tampered", "decryption", "Encrypted credential failed AES-GCM authentication");
  }
  pass("decryption", "AES-256-GCM authentication tag verified");

  // Legacy (v1) digests were taken over exactly the bytes that were encrypted.
  const version = meta.hashVersion || LEGACY_HASH_VERSION;
  const digest = version === LEGACY_HASH_VERSION ? sha256(plaintext) : credentialDigest(vc, version);
  if (digest.toLowerCase() !== credentialHash.toLowerCase()) {
    return fail("tampered", "digest", "Recomputed credential digest does not match the anchored hash");
  }
  pass("digest", `Digest (format v${version}) matches the anchored hash`);

  const pub = issuer?.publicKey ? "0x" + String(issuer.publicKey).replace(/^0x/, "") : null;
  let keyAddress = null;
  try { keyAddress = pub ? ethers.computeAddress(pub) : null; } catch { /* malformed key */ }
  if (!keyAddress || keyAddress.toLowerCase() !== String(onchain.issuer).toLowerCase()) {
    return fail("untrusted", "issuer_key", "No issuer key on record that belongs to the on-chain issuer address");
  }
  pass("issuer_key", "Issuer key belongs to the on-chain issuer address");

  if (vc?.issuer?.id !== issuer.did) {
    return fail("tampered", "vc_issuer", "The credential names a different issuer than the one that anchored it");
  }
  pass("vc_issuer", "Credential names the anchoring issuer");

  if (!verifyCredential(vc, pub)) {
    return fail("tampered", "vc_signature", "Issuer signature on the credential is invalid");
  }
  pass("vc_signature", "Issuer signature on the credential is valid");

  const subject = vc.credentialSubject || {};
  const mismatched = indexMismatches(meta, subject);
  if (mismatched.length) {
    return fail("tampered", "index_match", `Displayed record differs from the signed credential (${mismatched.join(", ")})`);
  }
  pass("index_match", "Displayed details match the signed credential");

  return { status: "verified", checks, subject };
}

/** Pre-fetch encrypted payloads in the background so first verifications are not slow. */
export async function warmIntegrityCache(cids, fetcher = fetchByCid) {
  for (const cid of cids) {
    try { await fetchEncrypted(cid, fetcher); } catch { /* retried on demand */ }
  }
}

/** Test hook: forget cached payloads. */
export function clearIntegrityCache() {
  cache.clear();
}
