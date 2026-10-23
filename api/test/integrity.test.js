// D02 — online "verified" means content integrity. A synthetic credential is issued through the
// real primitives (VC build + sign, canonical digest, AES-GCM, CID commitment); each negative
// path then distinguishes content tampering from unavailable storage and an untrusted key.
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";

process.env.AES_256_KEY = "11".repeat(32); // isolated test key, never the deployment key

let svc, crypto, vc, qr;
before(async () => {
  svc = await import("../src/services/integrity.service.js");
  crypto = await import("../src/services/crypto.service.js");
  vc = await import("../src/services/vc.service.js");
  qr = await import("../src/services/signedQr.service.js");
});
beforeEach(() => svc.clearIntegrityCache());

const wallet = ethers.Wallet.createRandom();
const issuerPriv = wallet.privateKey;
const claims = { name: "Test Graduate", nationalId: "111111/11/1", qualification: "BSc Synthetic Studies", graduationYear: 2025 };

function issue({ version = 2, claimsOverride, cid = "QmSyntheticCid1" } = {}) {
  const issuer = { did: `did:ethr:${wallet.address}`, publicKey: qr.publicKeyFor(issuerPriv), walletAddress: wallet.address };
  const signed = vc.signCredential(vc.buildCredential({ issuerDID: issuer.did, holderDID: "did:ethr:0xholder", claims: claimsOverride || claims }), issuerPriv, issuer.did);
  const credentialHash = version === 1 ? crypto.sha256(JSON.stringify(signed)) : crypto.credentialDigest(signed, 2);
  const encrypted = crypto.aesEncrypt(signed);
  const onchain = { status: "VERIFIED", issuer: wallet.address, cidHash: ethers.keccak256(ethers.toUtf8Bytes(cid)) };
  const meta = { cid, hashVersion: version === 1 ? undefined : 2, subjectName: claims.name, holderNationalId: claims.nationalId, qualification: claims.qualification, graduationYear: claims.graduationYear, holderDID: "did:ethr:0xholder" };
  return { issuer, signed, credentialHash, encrypted, onchain, meta, fetcher: async () => encrypted };
}

test("an intact credential passes every integrity check", async () => {
  const c = issue();
  const r = await svc.checkIntegrity({ ...c });
  assert.equal(r.status, "verified");
  assert.deepEqual(r.checks.map((x) => x.id), ["cid_commitment", "retrieval", "decryption", "digest", "issuer_key", "vc_issuer", "vc_signature", "index_match"]);
  assert.ok(r.checks.every((x) => x.ok));
});

test("a legacy (v1 digest) credential still verifies — migration path", async () => {
  const c = issue({ version: 1 });
  const r = await svc.checkIntegrity({ ...c });
  assert.equal(r.status, "verified");
  assert.match(r.checks.find((x) => x.id === "digest").detail, /format v1/);
});

test("edited display record (name changed in the database) → tampered", async () => {
  const c = issue();
  const r = await svc.checkIntegrity({ ...c, meta: { ...c.meta, subjectName: "Someone Else" } });
  assert.equal(r.status, "tampered");
  assert.equal(r.checks.at(-1).id, "index_match");
});

test("CID swapped in the database (no longer matches the on-chain commitment) → tampered", async () => {
  const c = issue();
  const r = await svc.checkIntegrity({ ...c, meta: { ...c.meta, cid: "QmAttackerCid" } });
  assert.equal(r.status, "tampered");
  assert.equal(r.checks.at(-1).id, "cid_commitment");
});

test("IPFS unreachable → unavailable (not tampered, not verified)", async () => {
  const c = issue();
  const r = await svc.checkIntegrity({ ...c, fetcher: async () => { throw new Error("gateway timeout"); } });
  assert.equal(r.status, "unavailable");
  assert.equal(r.checks.at(-1).id, "retrieval");
});

test("ciphertext modified in storage → AES-GCM authentication fails → tampered", async () => {
  const c = issue();
  const bytes = Buffer.from(c.encrypted.ciphertext, "base64");
  bytes[5] ^= 0xff;
  const r = await svc.checkIntegrity({ ...c, fetcher: async () => ({ ...c.encrypted, ciphertext: bytes.toString("base64") }) });
  assert.equal(r.status, "tampered");
  assert.equal(r.checks.at(-1).id, "decryption");
});

test("validly encrypted but different content behind the CID → digest mismatch → tampered", async () => {
  const c = issue();
  const other = issue({ claimsOverride: { ...claims, qualification: "PhD Forged" } });
  const r = await svc.checkIntegrity({ ...c, fetcher: other.fetcher });
  assert.equal(r.status, "tampered");
  assert.equal(r.checks.at(-1).id, "digest");
});

test("content altered after signing and re-anchored → VC signature fails → tampered", async () => {
  const c = issue();
  const altered = { ...c.signed, credentialSubject: { ...c.signed.credentialSubject, qualification: "PhD Forged" } };
  const r = await svc.checkIntegrity({
    ...c, credentialHash: crypto.credentialDigest(altered, 2),
    fetcher: async () => crypto.aesEncrypt(altered),
    meta: { ...c.meta, qualification: "PhD Forged" },
  });
  assert.equal(r.status, "tampered");
  assert.equal(r.checks.at(-1).id, "vc_signature");
});

test("issuer key on record does not belong to the on-chain issuer address → untrusted", async () => {
  const c = issue();
  const stranger = ethers.Wallet.createRandom();
  const r = await svc.checkIntegrity({ ...c, issuer: { ...c.issuer, publicKey: qr.publicKeyFor(stranger.privateKey) } });
  assert.equal(r.status, "untrusted");
  const r2 = await svc.checkIntegrity({ ...c, issuer: null });
  assert.equal(r2.status, "untrusted");
});

test("no off-chain record for an anchor → unavailable", async () => {
  const c = issue();
  const r = await svc.checkIntegrity({ ...c, meta: null });
  assert.equal(r.status, "unavailable");
});

test("a slow IPFS fetch that fails AFTER the timeout is unavailable, and never an unhandled rejection", async () => {
  // Regression: a Pinata 429 arriving after the 15 s timeout crashed the API process.
  const unhandled = [];
  const onUnhandled = (err) => unhandled.push(err);
  process.on("unhandledRejection", onUnhandled);
  try {
    const c = issue({ cid: "QmSlowCid" });
    const slowFailure = () => new Promise((_, reject) => setTimeout(() => reject(new Error("429 rate limited")), 60));
    const r = await svc.checkIntegrity({ ...c, fetcher: slowFailure, timeoutMs: 10 });
    assert.equal(r.status, "unavailable");
    assert.match(r.reason, /timed out/);
    await new Promise((resolve) => setTimeout(resolve, 120)); // let the late rejection land
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});
