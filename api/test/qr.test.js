// D03 — the signed QR binds the full credential reference. Every signed field is exercised:
// changing any one of them must invalidate the QR. Legacy QRs are accepted only when their
// unsigned full hash agrees with the signed fragment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes, bytesToHex } from "@noble/hashes/utils";
import {
  buildCredentialQr, buildSignedPayload, verifyOffline, checkQrReference, publicKeyFor, QR_VERSION,
} from "../src/services/signedQr.service.js";

const priv = bytesToHex(secp256k1.utils.randomPrivateKey());
const pub = publicKeyFor(priv);
const otherPriv = bytesToHex(secp256k1.utils.randomPrivateKey());
const HASH = "0x" + "ab".repeat(32);
const qr = buildCredentialQr({ credentialHash: HASH, cid: "QmCid1", holderDID: "did:ethr:0xholder", issuerDID: "did:ethr:0xissuer", iat: 1760000000 }, priv);

test("a v2 credential QR carries the full reference inside the signed payload", () => {
  assert.equal(qr.v, QR_VERSION);
  assert.equal(qr.hash, HASH);
  assert.equal(verifyOffline(qr, pub), true);
  assert.deepEqual(checkQrReference(qr), { ok: true, hash: HASH, legacy: false });
});

const MODIFIED = {
  hash: "0x" + "cd".repeat(32),
  cid: "QmOtherCid",
  cred_did: "did:ethr:0xsomeoneelse",
  iss_pk_ref: "did:ethr:0xother#keys-1",
  iat: 1760000001,
  typ: "zaqa-verify",
  v: 1,
};
for (const [field, value] of Object.entries(MODIFIED)) {
  test(`modifying the signed field "${field}" invalidates the QR`, () => {
    assert.equal(verifyOffline({ ...qr, [field]: value }, pub), false);
  });
}

test("adding a field after signing invalidates a v2 QR", () => {
  assert.equal(verifyOffline({ ...qr, extra: "x" }, pub), false);
});

test("a QR signed by another key does not verify", () => {
  const forged = buildCredentialQr({ credentialHash: HASH, cid: "QmCid1", holderDID: "did:ethr:0xholder", issuerDID: "did:ethr:0xissuer", iat: 1760000000 }, otherPriv);
  assert.equal(verifyOffline(forged, pub), false);
});

test("a v2 QR without a well-formed full reference is refused", () => {
  const p = buildSignedPayload({ typ: "bbacvs-credential", cid: "Qm", iss_pk_ref: "did:x#keys-1", iat: 1 }, priv);
  assert.equal(checkQrReference(p).ok, false);
});

// Legacy (pre-fix) QR: five pipe-joined fields signed, full hash appended unsigned.
function legacyQr(hash) {
  const fields = { cred_did: "did:ethr:0xholder", cid: "QmCid1", hash8: hash.slice(2, 18), iss_pk_ref: "did:ethr:0xissuer#keys-1", iat: 1700000000 };
  const msg = [fields.cred_did, fields.cid, fields.hash8, fields.iss_pk_ref, fields.iat].join("|");
  const sig = secp256k1.sign(sha256(utf8ToBytes(msg)), priv);
  return { ...fields, sig: "0x" + sig.toDERHex(), hash };
}

test("legacy QR signatures still verify and their reference is accepted when it matches hash8", () => {
  const old = legacyQr(HASH);
  assert.equal(verifyOffline(old, pub), true);
  assert.deepEqual(checkQrReference(old), { ok: true, hash: HASH, legacy: true });
});

test("legacy QR with a modified (unsigned) full hash is rejected — the D03 attack", () => {
  const old = legacyQr(HASH);
  const tampered = { ...old, hash: "0x" + "ef".repeat(32) };
  assert.equal(verifyOffline(tampered, pub), true, "signature alone cannot see the change");
  const ref = checkQrReference(tampered);
  assert.equal(ref.ok, false);
  assert.match(ref.reason, /does not match the signed fragment/);
});
