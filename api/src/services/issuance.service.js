// Shared credential-issuance primitives: build + ECDSA-sign the W3C VC, AES-encrypt, pin to
// IPFS, build the signed QR, and write the auxiliary index row. Used by the issuer/ECZ issue
// routes AND by the digitization-application workflow so both produce identical credentials.
import { ethers } from "ethers";
import { User, CredentialIndex } from "../models/index.js";
import { decryptKey } from "./keystore.service.js";
import { buildCredential, signCredential } from "./vc.service.js";
import { sha256, hashFragment, aesEncrypt } from "./crypto.service.js";
import { pin } from "./ipfs.service.js";
import { buildSignedPayload } from "./signedQr.service.js";
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

// ---- in-flight issuance lock -------------------------------------------------------------
// Issuance is slow (IPFS pin + Sepolia anchor, tens of seconds) and the index row is only
// written afterwards, so a database check alone cannot stop two concurrent requests (e.g. a
// double-clicked "Issue" button) from both reaching the chain. This process-local lock keyed on
// (issuer, candidate, qualification, year) rejects the second request immediately. The API runs
// as a single node process, so an in-memory set is sufficient; a multi-instance deployment
// would move this to a shared store (e.g. a unique index on a "reservation" collection).
const inFlight = new Set();

export function issuanceLockKey({ issuerId, holderEmail, nationalId, qualification, graduationYear }) {
  return [
    String(issuerId),
    holderEmail?.toLowerCase() || "",
    normaliseNationalId(nationalId) || "",
    String(qualification || "").trim().toLowerCase(),
    String(graduationYear ?? ""),
  ].join("|");
}

/** @returns a release function, or null when an identical issuance is already in progress. */
export function acquireIssuanceLock(key) {
  if (inFlight.has(key)) return null;
  inFlight.add(key);
  return () => inFlight.delete(key);
}

// Off-chain work shared by server-anchor and MetaMask-anchor: resolve holder DID, build +
// sign the VC, encrypt, pin, and build the signed QR. Returns everything needed to anchor.
export async function prepareCredential(issuer, holderEmail, claims) {
  const issuerPriv = decryptKey(issuer.encPrivateKey);
  const holder = await User.findOne({ email: holderEmail.toLowerCase(), role: "holder" });
  const holderDID = holder?.holderDID || `did:ethr:${ethers.Wallet.createRandom().address}`;

  const signedVC = signCredential(buildCredential({ issuerDID: issuer.did, holderDID, claims }), issuerPriv, issuer.did);
  const credentialHash = sha256(signedVC);
  const cid = await pin(aesEncrypt(signedVC));
  const cidHash = ethers.keccak256(ethers.toUtf8Bytes(cid));
  const qrPayload = {
    ...buildSignedPayload(
      { cred_did: holderDID, cid, hash8: hashFragment(credentialHash),
        iss_pk_ref: `${issuer.did}#keys-1`, iat: Math.floor(Date.now() / 1000) },
      issuerPriv
    ),
    hash: credentialHash,
  };
  return { holderDID, credentialHash, cid, cidHash, qrPayload };
}

export async function indexCredential(issuer, holderEmail, claims, prep, { status, anchorTx, meta = {} }) {
  return CredentialIndex.create({
    credentialHash: prep.credentialHash, cid: prep.cid, issuer: issuer._id,
    issuerAddress: issuer.walletAddress, issuerDID: issuer.did, institution: issuer.institution,
    issuerPublicKey: issuer.publicKey, holderDID: prep.holderDID, holderEmail: holderEmail?.toLowerCase(),
    subjectName: claims.name, holderNationalId: normaliseNationalId(claims.nationalId),
    qualification: claims.qualification, graduationYear: claims.graduationYear,
    zqfLevel: meta.zqfLevel, credentialType: meta.credentialType,
    qrPayload: prep.qrPayload, status, anchorTx,
  });
}
