import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { verifyOnChain } from "../services/web3.service.js";
import {
  verifyOffline, buildSignedPayload, renderQR, publicKeyFor, checkQrReference, QR_VERSION, CREDENTIAL_QR_TYPE,
} from "../services/signedQr.service.js";
import { checkIntegrity } from "../services/integrity.service.js";
import { resolveVerificationStatus, plainStatus } from "../services/verificationStatus.service.js";
import { buildVerificationCertificatePDF } from "../services/pdf.service.js";
import { CredentialIndex, Issuer, Programme, VerificationLog } from "../models/index.js";
import { config } from "../config/index.js";
import { maskNationalId } from "../utils/nationalId.js";
import { checkScope, findProgramme, checkProgrammeCycle } from "../services/scope.service.js";

const router = Router();

const RECOGNISED_AS = {
  secondary: "Secondary School Certificate", diploma: "Diploma", degree: "Degree",
  masters: "Master's Degree", phd: "Doctor of Philosophy (PhD)", other: "Qualification",
};

// Sector → the regulator that oversees the institution: higher-ed institutions answer to the
// HEA, TEVET (technical/vocational) institutions to TEVETA, secondary certification to the ECZ.
const REGULATOR_BY_SECTOR = { higher_ed: "HEA", tevet: "TEVETA", secondary: "ECZ" };

// On-chain status → plain-language integrity keyword + label for non-technical verifiers.
const INTEGRITY_KEY = { VERIFIED: "verified", REVOKED: "revoked", NOT_FOUND: "not_found", UNKNOWN_ISSUER: "unknown_issuer", UNAVAILABLE: "unavailable" };
const INTEGRITY_WORD = { verified: "Verified", revoked: "Revoked", not_found: "Not Found", unknown_issuer: "Unknown Issuer", unavailable: "Unavailable" };
// Content integrity (D02): was the signed credential behind the anchor retrieved and matched?
const CONTENT_WORD = {
  verified: "Verified — matches what the institution signed",
  tampered: "Failed — does not match what the institution signed",
  untrusted: "Unconfirmed — issuer key not trusted",
  unavailable: "Not checked — signed record temporarily unavailable",
  not_checked: "Not checked",
};

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Audit trail (verification_logs, no PII) — best-effort: never blocks or fails the response.
function recordVerification({ credentialHash, result, mode, latencyMs }) {
  VerificationLog.create({ credentialHash, result, mode, latencyMs }).catch(() => {});
}


// The on-chain issuer address → its Issuer row (whose public key must derive to that address).
async function issuerForAddress(address, hint) {
  if (!address || address === "0x0000000000000000000000000000000000000000") return null;
  if (hint?.walletAddress && hint.walletAddress.toLowerCase() === address.toLowerCase()) return hint;
  return Issuer.findOne({ walletAddress: { $regex: `^${escapeRegex(address)}$`, $options: "i" } }).lean();
}

const ZAQA_DID = "did:zaqa";
const zaqaPublicKey = () => (config.zaqa.signingKey ? publicKeyFor(config.zaqa.signingKey) : null);

// Issuers whose keys verifiers may trust right now: authorised on-chain and not suspended.
const trustedIssuerFilter = { onChain: true, heaStatus: { $ne: "suspended" } };

// How long an offline verifier may rely on a cached key set before it must re-sync (D06).
const OFFLINE_KEY_MAX_AGE_S = 7 * 24 * 3600;

// GET /api/verify/issuer-keys (Public) — issuer public keys for OFFLINE verification.
// Verifier apps cache these while online; offline validation then needs no network.
// The response says when it was generated and how long it may be relied on, so offline results
// can show the age and provenance of the key that checked them (D06). Only issuers currently
// authorised on-chain and not suspended are included; the ZAQA certificate key is added so
// ZAQA verification-certificate QRs can be checked offline too.
router.get("/issuer-keys", async (_req, res, next) => {
  try {
    const issuers = await Issuer.find(trustedIssuerFilter).select("did institution publicKey walletAddress").lean();
    const keys = issuers.map((i) => ({ did: i.did, institution: i.institution, publicKey: i.publicKey, address: i.walletAddress }));
    const zaqaKey = zaqaPublicKey();
    if (zaqaKey) keys.push({ did: ZAQA_DID, institution: "Zambia Qualifications Authority", publicKey: zaqaKey });
    res.json({
      generatedAt: new Date().toISOString(),
      maxAgeSeconds: OFFLINE_KEY_MAX_AGE_S,
      source: "BBACVS trusted-issuer registry",
      keys,
    });
  } catch (err) { next(err); }
});

// Full online verification of one credential hash (Figure 3.4, D02/D05):
// on-chain status → content integrity (CID commitment, IPFS fetch, AES-GCM, digest, issuer key,
// VC signature, index match) → one resolved status that drives headline AND summary.
// Returns { body, meta } — body is the public API response.
export async function verifyCredentialHash(credentialHash) {
  let onchain = null;
  try {
    onchain = await verifyOnChain(credentialHash);
  } catch {
    onchain = null; // RPC unreachable — reported as UNAVAILABLE, never as a verdict
  }
  const chain = onchain ? onchain.status : "UNAVAILABLE";
  // Human-readable metadata from the auxiliary index (non-authoritative — checked below).
  const meta = await CredentialIndex.findOne({ credentialHash }).lean();
  // Governance status chain: the issuing institution's regulator standing at verify time.
  const issuerRec = meta ? await Issuer.findById(meta.issuer).lean() : null;

  let integrity = { status: "not_checked", checks: [] };
  if (onchain && onchain.status !== "NOT_FOUND") {
    const anchoringIssuer = await issuerForAddress(onchain.issuer, issuerRec);
    integrity = await checkIntegrity({ credentialHash, onchain, meta, issuer: anchoringIssuer });
  }
  const { displayStatus, credentialStatus, rule } = resolveVerificationStatus({ chain, integrity: integrity.status, meta });

  // Programme accreditation cross-check: does an APPROVED programme of this institution match
  // the credential's qualification? null when the institution has no programmes on record.
  let programmeAccredited = null;
  if (meta?.issuer) {
    const programmeCount = await Programme.countDocuments({ issuer: meta.issuer });
    if (programmeCount > 0) {
      programmeAccredited = meta.qualification
        ? !!(await Programme.exists({
            issuer: meta.issuer,
            status: "approved",
            name: { $regex: `^${escapeRegex(meta.qualification)}$`, $options: "i" },
          }))
        : false;
    }
  }

  // Was the institution accredited for this kind of award when it was made, and was the
  // programme actually running then? null when nothing is recorded to judge against.
  let scopeAtAward = null, programmeOfferedInYear = null, eligibilityDetail = null;
  if (meta && issuerRec) {
    const scope = checkScope(issuerRec, { credentialType: meta.credentialType, zqfLevel: meta.zqfLevel, graduationYear: meta.graduationYear, studyStartYear: meta.studyStartYear, qualification: meta.qualification });
    if (scope.applicable) { scopeAtAward = scope.ok; if (!scope.ok) eligibilityDetail = scope.detail; }
    const cycle = checkProgrammeCycle(await findProgramme(meta.issuer, meta.qualification), meta.graduationYear, { studyStartYear: meta.studyStartYear, zqfLevel: meta.zqfLevel });
    if (cycle.applicable) { programmeOfferedInYear = cycle.ok; if (!cycle.ok && !eligibilityDetail) eligibilityDetail = cycle.detail; }
  }

  // Plain-language summary for non-technical verifiers (no hashes, no tx ids, no jargon).
  const blockchainIntegrity = INTEGRITY_KEY[chain] || "unavailable";
  const summary = {
    blockchainIntegrity,
    blockchainIntegrityLabel: `Blockchain Integrity: ${INTEGRITY_WORD[blockchainIntegrity]}`,
    // Whether the signed content behind the anchor was checked and matched (D02).
    contentIntegrity: integrity.status,
    contentIntegrityLabel: CONTENT_WORD[integrity.status],
    credentialStatus,
    // Hash of the corrected replacement, when one exists — lets the verifier UI link to it.
    supersededBy: meta?.supersededBy || null,
    qualification: {
      title: meta?.qualification || null,
      nqfLevel: meta?.zqfLevel ?? null,
      frameworkVersion: meta?.frameworkVersion || null,
    },
    institution: issuerRec
      ? {
          name: issuerRec.institution,
          // Legacy issuers created before heaStatus existed read as undefined → treated approved.
          accreditationStatus: issuerRec.heaStatus || "approved (legacy)",
          regulator: REGULATOR_BY_SECTOR[issuerRec.sector] || "HEA",
          zaqaTrusted: !!issuerRec.zaqaTrusted,
        }
      : null,
    programmeAccredited,
    scopeAtAward,
    programmeOfferedInYear,
    eligibilityDetail,
    issuerAuthority: !!issuerRec?.onChain,
    zaqa: {
      validation: meta?.zaqaValidation || null,
      ref: meta?.zaqaRef || null,
      validatedAt: meta?.zaqaValidatedAt || null,
    },
  };

  // Record details are only shown when they are backed by the signed credential (or when the
  // credential is revoked/not found, where they only identify what was checked).
  const body = {
    status: chain, // on-chain: VERIFIED | REVOKED | UNKNOWN_ISSUER | NOT_FOUND | UNAVAILABLE
    displayStatus,
    issuer: onchain?.issuer ?? null,
    // Original issuance time (unix s). Credentials re-anchored on the D01 contracts carry the
    // migration time on-chain, so the index's issuance date is preferred; anchoredAt is the chain's.
    issuedAt: meta?.issuedAt ? Math.floor(new Date(meta.issuedAt).getTime() / 1000) : (onchain?.issuedAt ?? null),
    anchoredAt: onchain?.issuedAt ?? null,
    mode: "online",
    // Evidence for the result: which integrity checks ran and which rule decided the status.
    integrity: { status: integrity.status, reason: integrity.reason || null, checks: integrity.checks, statusRule: rule },
    credential: meta
      ? {
          institution: meta.institution,
          subjectName: meta.subjectName,
          // Masked NRC / national ID (e.g. ••••••/78/1) — lets a verifier tell two graduates
          // with the same name apart without ever exposing the full identifier.
          nationalId: maskNationalId(meta.holderNationalId),
          qualification: meta.qualification,
          graduationYear: meta.graduationYear,
          studyStartYear: meta.studyStartYear ?? null,
          holderDID: meta.holderDID,
          zqfLevel: meta.zqfLevel,
          credentialType: meta.credentialType,
          zaqaValidation: meta.zaqaValidation, // ZAQA final national validation
        }
      : null,
    // Governance standing surfaced to the verifier (issuer authenticity + regulator status).
    governance: issuerRec
      ? {
          sector: issuerRec.sector,
          // Regulator by sector: HEA (higher-ed), TEVETA (tevet), ECZ (secondary).
          regulator: REGULATOR_BY_SECTOR[issuerRec.sector] || "HEA",
          heaStatus: issuerRec.sector === "secondary" ? null : (issuerRec.heaStatus || "approved"),
          zaqaTrusted: !!issuerRec.zaqaTrusted, // in ZAQA national trusted-issuer registry
          onChainAuthorised: !!issuerRec.onChain,
        }
      : null,
    summary,
  };
  return { body, meta };
}

/** Overrule a verification result because the presented QR itself failed a check. */
function overrule(body, displayStatus, reason) {
  body.displayStatus = displayStatus;
  body.summary.credentialStatus = plainStatus(displayStatus);
  body.qr.reason = reason;
  return body;
}

// GET /api/verify/:id (Public, no auth) — ONLINE verification by credential reference.
router.get("/:id", async (req, res, next) => {
  const startedAt = Date.now();
  try {
    const credentialHash = req.params.id;
    if (!/^0x[a-fA-F0-9]{64}$/.test(credentialHash)) {
      return res.status(400).json({ error: "Invalid credential hash" });
    }
    const { body } = await verifyCredentialHash(credentialHash);
    recordVerification({ credentialHash, result: body.displayStatus, mode: "online", latencyMs: Date.now() - startedAt });
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// POST /api/verify/qr (Public) — ONLINE verification of a scanned QR (D03). The QR's signature
// is checked BEFORE its credential reference is trusted: the signing key is resolved
// server-side from the QR's issuer DID, the reference must be inside the signature (v2) or
// match the signed fragment (legacy), and a credential QR must be signed by the issuer that
// anchored the credential and name the same CID.
const qrSchema = Joi.object({
  payload: Joi.object({
    sig: Joi.string().required(),
    iss_pk_ref: Joi.string().required(),
  }).unknown(true).required(),
});
router.post("/qr", validate(qrSchema), async (req, res, next) => {
  const startedAt = Date.now();
  try {
    const { payload } = req.body;
    const did = String(payload.iss_pk_ref).split("#")[0];
    const signerIssuer = did === ZAQA_DID ? null : await Issuer.findOne({ did }).select("did publicKey").lean();
    const pub = did === ZAQA_DID ? zaqaPublicKey() : signerIssuer?.publicKey;
    const qr = { version: payload.v === QR_VERSION ? QR_VERSION : 1, legacy: payload.v !== QR_VERSION, signature: "unchecked", signer: did };

    if (!pub) {
      return res.json({ status: "UNKNOWN_ISSUER", displayStatus: "UNKNOWN_ISSUER", mode: "online", qr: { ...qr, signature: "unknown_key" }, reason: plainStatus("UNKNOWN_ISSUER") });
    }
    if (!verifyOffline(payload, pub)) {
      return res.json({ status: "INVALID", displayStatus: "INVALID", mode: "online", qr: { ...qr, signature: "invalid" }, reason: plainStatus("INVALID") });
    }
    qr.signature = "valid";
    const ref = checkQrReference(payload);
    if (!ref.ok) {
      return res.json({ status: "TAMPERED", displayStatus: "TAMPERED", mode: "online", qr: { ...qr, reason: ref.reason }, reason: ref.reason });
    }

    const { body, meta } = await verifyCredentialHash(ref.hash);
    body.qr = qr;
    const isCredentialQr = qr.legacy || payload.typ === CREDENTIAL_QR_TYPE;
    if (meta && isCredentialQr) {
      if (meta.issuerDID && meta.issuerDID !== did) overrule(body, "TAMPERED", "QR is signed by a different issuer than the one that issued the credential");
      else if (payload.cid && meta.cid && payload.cid !== meta.cid) overrule(body, "TAMPERED", "QR names a different CID than the anchored credential");
    }
    recordVerification({ credentialHash: ref.hash, result: body.displayStatus, mode: "online", latencyMs: Date.now() - startedAt });
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// Statement of the regulator under which the awarding institution is registered.
const REGULATOR_STATEMENT = {
  higher_ed: "By the Higher Education Authority established by the Higher Education Act No. 4 of 2013 of the Republic of Zambia.",
  tevet: "By the Technical Education, Vocational and Entrepreneurship Training Authority (TEVETA) established by the TEVET Act No. 13 of 1998 of the Republic of Zambia.",
  secondary: "By the Examinations Council of Zambia established by the Examinations Council of Zambia Act No. 15 of 1983 of the Republic of Zambia.",
};

// GET /api/verify/:hash/certificate (Public) — download the ZAQA "Certificate of Verification
// and Evaluation of Qualification" as a PDF with a ZAQA-signed QR. Only available once the
// credential is on-chain VERIFIED and ZAQA final validation = "validated".
router.get("/:hash/certificate", async (req, res, next) => {
  try {
    const credentialHash = req.params.hash;
    if (!/^0x[a-fA-F0-9]{64}$/.test(credentialHash)) {
      return res.status(400).json({ error: "Invalid credential hash" });
    }
    const meta = await CredentialIndex.findOne({ credentialHash }).lean();
    if (!meta) return res.status(404).json({ error: "Credential not found" });
    // Suspension is off-chain (the credential stays VERIFIED on-chain until revoked) — the
    // ZAQA certificate must not be downloadable while the credential is suspended.
    if (meta.status === "suspended") {
      return res.status(409).json({ error: "credential_suspended" });
    }
    if (meta.zaqaValidation !== "validated") {
      return res.status(403).json({ error: "This qualification has not received ZAQA final validation yet." });
    }
    // Same policy as public verification: on-chain VERIFIED, content integrity proven, and in
    // good standing. Anything else (tampered, unavailable, revoked…) blocks the certificate.
    const { body: verdict } = await verifyCredentialHash(credentialHash);
    if (verdict.displayStatus !== "VERIFIED") {
      return res.status(403).json({ error: `Credential cannot be certified right now (status: ${verdict.displayStatus}).`, status: verdict.displayStatus });
    }

    // ZAQA-signed QR payload (raw signature lives only inside the QR, never printed).
    const zaqaKey = config.zaqa.signingKey;
    let qrDataUrl = null;
    if (zaqaKey) {
      // QR schema v2: type, full credential reference and ZAQA reference are all signed.
      const signed = buildSignedPayload(
        {
          typ: "zaqa-verify",
          hash: credentialHash,
          ref: meta.zaqaRef || "",
          cred_did: meta.holderDID || "",
          iss_pk_ref: `${ZAQA_DID}#keys-1`,
          iat: Math.floor(new Date(meta.zaqaValidatedAt || Date.now()).getTime() / 1000),
        },
        zaqaKey
      );
      qrDataUrl = await renderQR(signed);
    }

    const validatedAt = meta.zaqaValidatedAt
      ? new Date(meta.zaqaValidatedAt).toLocaleDateString("en-GB")
      : "—";
    // The recognising regulator follows the issuing institution's sector: HEA for higher
    // education, TEVETA for TEVET institutions, ECZ for secondary certification.
    const issuerDoc = meta.issuer ? await Issuer.findById(meta.issuer).select("sector").lean() : null;
    const pdf = await buildVerificationCertificatePDF({
      recognisedBy: REGULATOR_STATEMENT[issuerDoc?.sector] || REGULATOR_STATEMENT.higher_ed,
      holder: meta.subjectName,
      nationalId: maskNationalId(meta.holderNationalId) || "—",
      zaqaRef: meta.zaqaRef || "—",
      validatedAt,
      recognisedAs: RECOGNISED_AS[meta.credentialType] || "Qualification",
      title: meta.qualification,
      awardedOn: meta.graduationYear ? String(meta.graduationYear) : "—",
      institution: meta.institution,
      zqfLevel: meta.zqfLevel,
      qrDataUrl,
      credentialHash,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="ZAQA-verification-${credentialHash.slice(0, 10)}.pdf"`);
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

// POST /api/verify/offline (Public, no auth) — signature-only check of a QR (Figure 3.5, D06).
// The signing key is resolved from the trusted-issuer registry by the QR's issuer DID (a key
// supplied by the caller is ignored unless the issuer is unknown here). A valid result proves
// who signed the QR and that it was not altered — NOT that the credential is still valid:
// revocation and suspension need the online check.
const offlineSchema = Joi.object({
  payload: Joi.object({
    sig: Joi.string().required(),
    iss_pk_ref: Joi.string().required(),
  }).unknown(true).required(),
  issuerPubKey: Joi.string().optional(),
});
router.post("/offline", validate(offlineSchema), async (req, res, next) => {
  try {
    const startedAt = Date.now();
    const { payload, issuerPubKey } = req.body;
    const did = String(payload.iss_pk_ref).split("#")[0];
    const issuer = did === ZAQA_DID ? null : await Issuer.findOne({ did, ...trustedIssuerFilter }).select("publicKey institution").lean();
    const registryKey = did === ZAQA_DID ? zaqaPublicKey() : issuer?.publicKey;
    const key = registryKey || issuerPubKey;
    const valid = !!key && verifyOffline(payload, key);
    const status = !key ? "UNKNOWN_ISSUER" : valid ? "SIGNATURE_ONLY" : "INVALID";
    const ref = checkQrReference(payload);
    recordVerification({
      credentialHash: ref.ok ? ref.hash : payload.cid, result: status, mode: "offline", latencyMs: Date.now() - startedAt,
    });
    res.json({
      status,
      signer: did,
      keySource: registryKey ? "registry" : issuerPubKey ? "caller-supplied (untrusted)" : null,
      institution: issuer?.institution || null,
      qrVersion: payload.v === QR_VERSION ? QR_VERSION : 1,
      note: "Signature-only result: confirms who signed the QR and that it is unaltered. It does not show revocation or suspension — verify online for current status.",
    });
  } catch (err) { next(err); }
});

export default router;
