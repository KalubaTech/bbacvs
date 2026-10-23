// Shared credential-issuance primitives: build + ECDSA-sign the W3C VC, AES-encrypt, pin to
// IPFS, build the signed QR, and write the auxiliary index row. Used by the issuer/ECZ issue
// routes AND by the digitization-application workflow so both produce identical credentials.
import { randomUUID } from "node:crypto";
import { ethers } from "ethers";
import { User, Issuer, CredentialIndex, IssuanceReservation } from "../models/index.js";
import { decryptKey } from "./keystore.service.js";
import { buildCredential, signCredential } from "./vc.service.js";
import { credentialDigest, CURRENT_HASH_VERSION, aesEncrypt } from "./crypto.service.js";
import { pin } from "./ipfs.service.js";
import { buildCredentialQr } from "./signedQr.service.js";
import { normaliseNationalId } from "../utils/nationalId.js";

// Statuses under which a credential still "exists" for duplicate purposes. Revoked records are
// history (they may legitimately be superseded by a corrected reissue); everything else — an
// anchored credential, one awaiting its MetaMask anchor, or one suspended pending
// investigation — blocks a second issuance of the same qualification to the same person.
export const LIVE_CREDENTIAL_STATUSES = ["active", "pending", "suspended"];

export const DUPLICATE_CREDENTIAL_MESSAGE =
  "An active or pending credential already exists for this candidate and programme.";

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Identity clauses for "the same person": the holder's email (lower-cased) and, when known,
 * their NRC / national ID. A candidate who applies again under a different email address is
 * still matched through the NRC.
 */
export function holderIdentityClauses({ holderEmail, nationalId, holderDID } = {}) {
  const or = [];
  const email = holderEmail?.toLowerCase();
  if (email) or.push({ holderEmail: email });
  const nid = normaliseNationalId(nationalId);
  if (nid) or.push({ holderNationalId: nid });
  if (holderDID) or.push({ holderDID });
  return or;
}

/**
 * Find a live (active / pending / suspended) credential already issued by this institution to
 * this candidate for the same qualification and graduation year. Used as the pre-issuance
 * guard so a double-click or a re-submission can never mint the same qualification twice.
 * @returns the matching index row, or null.
 */
export async function findDuplicateCredential({ issuerId, holderEmail, nationalId, qualification, graduationYear, excludeHash }) {
  const or = holderIdentityClauses({ holderEmail, nationalId });
  if (!or.length) return null;
  const query = {
    issuer: issuerId,
    qualification: { $regex: `^${escapeRegex(String(qualification || "").trim())}$`, $options: "i" },
    graduationYear,
    status: { $in: LIVE_CREDENTIAL_STATUSES },
    $or: or,
  };
  if (excludeHash) query.credentialHash = { $ne: excludeHash };
  return CredentialIndex.findOne(query).lean();
}

/** Compact, non-sensitive description of a duplicate for the 409 response body. */
export function describeDuplicate(dup, { holderEmail, nationalId } = {}) {
  const matchedOn = [];
  if (holderEmail && dup.holderEmail === holderEmail.toLowerCase()) matchedOn.push("email");
  const nid = normaliseNationalId(nationalId);
  if (nid && dup.holderNationalId === nid) matchedOn.push("nationalId");
  return { credentialHash: dup.credentialHash, status: dup.status, issuedAt: dup.issuedAt || dup.createdAt, matchedOn };
}

// ---- in-flight issuance reservation (D08) ---------------------------------------------------
// Issuance is slow (IPFS pin + Sepolia anchor, tens of seconds) and the index row is only
// written afterwards, so a database check alone cannot stop two concurrent requests (e.g. a
// double-clicked "Issue" button) from both reaching the chain. A reservation row keyed on
// (issuer, candidate, qualification, year) is inserted first; the unique index on `key` lets
// exactly one request win, across every API process sharing the database. Reservations expire
// (TTL) so a crashed process cannot block a candidate forever.
export const RESERVATION_TTL_MS = 10 * 60 * 1000;

export function issuanceLockKey({ issuerId, holderEmail, nationalId, qualification, graduationYear }) {
  return [
    String(issuerId),
    holderEmail?.toLowerCase() || "",
    normaliseNationalId(nationalId) || "",
    String(qualification || "").trim().toLowerCase(),
    String(graduationYear ?? ""),
  ].join("|");
}

/** @returns an async release function, or null when an identical issuance is already in progress. */
export async function acquireIssuanceLock(key, { ttlMs = RESERVATION_TTL_MS } = {}) {
  const owner = randomUUID();
  // A reservation past its expiry may not have been swept by the TTL monitor yet (it runs
  // about once a minute) — clear it so it cannot block a retry.
  await IssuanceReservation.deleteOne({ key, expiresAt: { $lte: new Date() } });
  try {
    await IssuanceReservation.create({ key, owner, expiresAt: new Date(Date.now() + ttlMs) });
  } catch (err) {
    if (err?.code === 11000) return null; // another request (in any process) holds it
    throw err;
  }
  return () => IssuanceReservation.deleteOne({ key, owner }).catch(() => {});
}

/**
 * Duplicate-issuance guard. Reserve first, then look for a live duplicate: a request that
 * finished just before this one reserved has written its index row by then, so the check
 * cannot miss it. Returns { release } when issuance may proceed, or { conflict } (a 409 body).
 */
export async function reserveIssuance({ issuerId, holderEmail, nationalId, qualification, graduationYear, excludeHash }) {
  const identity = { issuerId, holderEmail, nationalId, qualification, graduationYear };
  const release = await acquireIssuanceLock(issuanceLockKey(identity));
  if (!release) {
    return { conflict: { error: "This credential is already being issued — please wait for the first request to finish.", code: "issuance_in_progress" } };
  }
  try {
    const dup = await findDuplicateCredential({ ...identity, excludeHash });
    if (dup) {
      await release();
      return { conflict: { error: DUPLICATE_CREDENTIAL_MESSAGE, code: "duplicate_credential", existing: describeDuplicate(dup, { holderEmail, nationalId }) } };
    }
  } catch (err) {
    await release();
    throw err;
  }
  return { release };
}

// Off-chain work shared by server-anchor and MetaMask-anchor: resolve holder DID, build +
// sign the VC, encrypt, pin, and build the signed QR. Returns everything needed to anchor.
export async function prepareCredential(issuer, holderEmail, claims) {
  const issuerPriv = decryptKey(issuer.encPrivateKey);
  const holder = await User.findOne({ email: holderEmail.toLowerCase(), role: "holder" });
  const holderDID = holder?.holderDID || `did:ethr:${ethers.Wallet.createRandom().address}`;

  const signedVC = signCredential(buildCredential({ issuerDID: issuer.did, holderDID, claims }), issuerPriv, issuer.did);
  const hashVersion = CURRENT_HASH_VERSION;
  const credentialHash = credentialDigest(signedVC, hashVersion);
  const cid = await pin(aesEncrypt(signedVC));
  const cidHash = ethers.keccak256(ethers.toUtf8Bytes(cid));
  // The full credential reference is INSIDE the signed QR message (D03).
  const qrPayload = buildCredentialQr({ credentialHash, cid, holderDID, issuerDID: issuer.did }, issuerPriv);
  return { holderDID, credentialHash, hashVersion, cid, cidHash, qrPayload };
}

export async function indexCredential(issuer, holderEmail, claims, prep, { status, anchorTx, meta = {} }) {
  return CredentialIndex.create({
    credentialHash: prep.credentialHash, hashVersion: prep.hashVersion, cid: prep.cid, issuer: issuer._id,
    issuerAddress: issuer.walletAddress, issuerDID: issuer.did, institution: issuer.institution,
    issuerPublicKey: issuer.publicKey, holderDID: prep.holderDID, holderEmail: holderEmail?.toLowerCase(),
    subjectName: claims.name, holderNationalId: normaliseNationalId(claims.nationalId),
    qualification: claims.qualification, graduationYear: claims.graduationYear,
    studyStartYear: claims.studyStartYear || undefined,
    zqfLevel: meta.zqfLevel, credentialType: meta.credentialType,
    qrPayload: prep.qrPayload, status, anchorTx,
  });
}

/**
 * The QR to hand out for a credential: its stored payload if that is already a signed v2 QR,
 * otherwise a fresh v2 QR re-signed with the issuer's custodied key (and saved back), so legacy
 * QRs whose full reference sat outside the signature stop being distributed (D03).
 */
export async function currentCredentialQr(cred) {
  if (cred.qrPayload?.v === 2 && cred.qrPayload.hash === cred.credentialHash) return cred.qrPayload;
  const issuer = await Issuer.findById(cred.issuer).select("encPrivateKey did").lean();
  if (!issuer?.encPrivateKey) return { ...cred.qrPayload, hash: cred.credentialHash };
  const qrPayload = buildCredentialQr({
    credentialHash: cred.credentialHash, cid: cred.cid, holderDID: cred.holderDID, issuerDID: issuer.did,
  }, decryptKey(issuer.encPrivateKey));
  await CredentialIndex.updateOne({ _id: cred._id }, { $set: { qrPayload } });
  return qrPayload;
}
