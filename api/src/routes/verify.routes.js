import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { verifyOnChain } from "../services/web3.service.js";
import { verifyOffline, buildSignedPayload, renderQR } from "../services/signedQr.service.js";
import { buildVerificationCertificatePDF } from "../services/pdf.service.js";
import { CredentialIndex, Issuer, Programme, VerificationLog } from "../models/index.js";
import { config } from "../config/index.js";

const router = Router();

const RECOGNISED_AS = {
  secondary: "Secondary School Certificate", diploma: "Diploma", degree: "Degree",
  masters: "Master's Degree", phd: "Doctor of Philosophy (PhD)", other: "Qualification",
};

// Sector → the regulator that oversees the institution: higher-ed institutions answer to the
// HEA, TEVET (technical/vocational) institutions to TEVETA, secondary certification to the ECZ.
const REGULATOR_BY_SECTOR = { higher_ed: "HEA", tevet: "TEVETA", secondary: "ECZ" };

// On-chain status → plain-language integrity keyword + label for non-technical verifiers.
const INTEGRITY_KEY = { VERIFIED: "verified", REVOKED: "revoked", NOT_FOUND: "not_found", UNKNOWN_ISSUER: "unknown_issuer" };
const INTEGRITY_WORD = { verified: "Verified", revoked: "Revoked", not_found: "Not Found", unknown_issuer: "Unknown Issuer" };

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Plain-language credential status for the verifier summary — folds the on-chain result,
// the off-chain lifecycle (suspension / supersession) and the ZAQA validation state into
// one sentence a non-technical verifier can act on. No hashes, no jargon.
function plainCredentialStatus(onchainStatus, meta) {
  if (onchainStatus === "NOT_FOUND") return "Not found on the blockchain";
  if (onchainStatus === "UNKNOWN_ISSUER") return "Issued by an unrecognised institution";
  if (onchainStatus === "REVOKED") {
    return meta?.supersededBy ? "Revoked — replaced by a corrected credential" : "Revoked";
  }
  // On-chain VERIFIED: suspension is an off-chain state (on-chain stays VERIFIED until revoked).
  if (meta?.status === "suspended" || meta?.zaqaValidation === "suspended") {
    return "Suspended pending investigation";
  }
  switch (meta?.zaqaValidation) {
    case "validated": return "Valid";
    case "suspicious": return "Flagged for review";
    case "under_dispute": return "Under dispute";
    case "rejected": return "Not recognised by ZAQA";
    default: return "Pending national validation"; // draft / pending / no index record
  }
}

// Audit trail (verification_logs, no PII) — best-effort: never blocks or fails the response.
function recordVerification({ credentialHash, result, mode, latencyMs }) {
  VerificationLog.create({ credentialHash, result, mode, latencyMs }).catch(() => {});
}

// Mask an NRC/passport for the public certificate (privacy — matches the redaction on the
// official document): keep the last 2 characters only.
function maskNationalId(id) {
  if (!id) return "—";
  const s = String(id);
  return s.length <= 2 ? s : "•".repeat(Math.max(3, s.length - 2)) + s.slice(-2);
}

// Headline verification result: on-chain lifecycle takes precedence, then the ZAQA state.
function combinedStatus(onchainStatus, zaqaValidation) {
  if (onchainStatus !== "VERIFIED") return onchainStatus; // REVOKED | NOT_FOUND | UNKNOWN_ISSUER
  switch (zaqaValidation) {
    case "validated": return "VERIFIED";
    case "suspended": return "SUSPENDED";
    case "suspicious": return "SUSPICIOUS";
    case "under_dispute": return "UNDER_DISPUTE";
    case "rejected": return "REJECTED";
    default: return "PENDING_ZAQA_VALIDATION"; // draft / pending
  }
}

// GET /api/verify/issuer-keys (Public) — issuer public keys for OFFLINE verification.
// Verifier apps cache these while online; offline validation then needs no network.
router.get("/issuer-keys", async (_req, res, next) => {
  try {
    const issuers = await Issuer.find({ onChain: true }).select("did institution publicKey").lean();
    res.json({
      keys: issuers.map((i) => ({ did: i.did, institution: i.institution, publicKey: i.publicKey })),
    });
  } catch (err) { next(err); }
});

// GET /api/verify/:id (Public, no auth) — ONLINE verification (Figure 3.4).
// Flow: parse QR -> validate ECDSA sig -> IPFS fetch + AES decrypt -> SHA-256 recompute
// -> on-chain hash compare -> return one of VERIFIED/TAMPERED/REVOKED/UNKNOWN_ISSUER/NOT_FOUND.
router.get("/:id", async (req, res, next) => {
  const startedAt = Date.now();
  try {
    const credentialHash = req.params.id;
    if (!/^0x[a-fA-F0-9]{64}$/.test(credentialHash)) {
      return res.status(400).json({ error: "Invalid credential hash" });
    }

    const onchain = await verifyOnChain(credentialHash);
    // Enrich with human-readable metadata from the auxiliary index (non-authoritative).
    const meta = await CredentialIndex.findOne({ credentialHash }).lean();
    // Governance status chain: the issuing institution's regulator standing at verify time.
    const issuerRec = meta ? await Issuer.findById(meta.issuer).lean() : null;
    // Combined display status (Flow C): on-chain state wins for REVOKED/NOT_FOUND/UNKNOWN_ISSUER,
    // otherwise the ZAQA validation state drives the headline result.
    const displayStatus = combinedStatus(onchain.status, meta?.zaqaValidation);

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

    // Plain-language summary for non-technical verifiers (no hashes, no tx ids, no jargon).
    const blockchainIntegrity = INTEGRITY_KEY[onchain.status] || "not_found";
    const summary = {
      blockchainIntegrity,
      blockchainIntegrityLabel: `Blockchain Integrity: ${INTEGRITY_WORD[blockchainIntegrity]}`,
      credentialStatus: plainCredentialStatus(onchain.status, meta),
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
      issuerAuthority: !!issuerRec?.onChain,
      zaqa: {
        validation: meta?.zaqaValidation || null,
        ref: meta?.zaqaRef || null,
        validatedAt: meta?.zaqaValidatedAt || null,
      },
    };

    recordVerification({
      credentialHash, result: displayStatus, mode: "online", latencyMs: Date.now() - startedAt,
    });
    res.json({
      status: onchain.status, // VERIFIED | REVOKED | UNKNOWN_ISSUER | NOT_FOUND
      displayStatus,
      issuer: onchain.issuer,
      issuedAt: onchain.issuedAt,
      mode: "online",
      credential: meta
        ? {
            institution: meta.institution,
            subjectName: meta.subjectName,
            qualification: meta.qualification,
            graduationYear: meta.graduationYear,
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
    });
  } catch (err) {
    next(err);
  }
});

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
    const onchain = await verifyOnChain(credentialHash);
    if (onchain.status !== "VERIFIED") {
      return res.status(403).json({ error: `Credential is not verifiable on-chain (status: ${onchain.status}).` });
    }

    // ZAQA-signed QR payload (raw signature lives only inside the QR, never printed).
    const zaqaKey = config.zaqa.signingKey;
    let qrDataUrl = null;
    if (zaqaKey) {
      const signed = buildSignedPayload(
        {
          cred_did: meta.holderDID || "",
          cid: credentialHash,
          hash8: meta.zaqaRef || credentialHash.slice(2, 10),
          iss_pk_ref: "did:zaqa#keys-1",
          iat: Math.floor(new Date(meta.zaqaValidatedAt || Date.now()).getTime() / 1000),
        },
        zaqaKey
      );
      qrDataUrl = await renderQR({ ...signed, typ: "zaqa-verify", hash: credentialHash });
    }

    const validatedAt = meta.zaqaValidatedAt
      ? new Date(meta.zaqaValidatedAt).toLocaleDateString("en-GB")
      : "—";
    const pdf = await buildVerificationCertificatePDF({
      holder: meta.subjectName,
      nationalId: maskNationalId(meta.holderNationalId),
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

// POST /api/verify/offline (Public, no auth) — OFFLINE verification (Figure 3.5).
const offlineSchema = Joi.object({
  payload: Joi.object({
    cred_did: Joi.string().required(),
    cid: Joi.string().required(),
    hash8: Joi.string().required(),
    iss_pk_ref: Joi.string().required(),
    iat: Joi.number().required(),
    sig: Joi.string().required(),
  }).required(),
  issuerPubKey: Joi.string().required(), // from local cache; included here for stateless API demo
});
router.post("/offline", validate(offlineSchema), (req, res) => {
  const startedAt = Date.now();
  const { payload, issuerPubKey } = req.body;
  const valid = verifyOffline(payload, issuerPubKey);
  const status = valid ? "OFFLINE_VERIFIED" : "INVALID";
  recordVerification({
    credentialHash: payload.cid, result: status, mode: "offline", latencyMs: Date.now() - startedAt,
  });
  res.json({
    status,
    issuer: payload.cred_did,
    note: "Offline confirms issuer authenticity + QR integrity; revocation needs later online re-check.",
  });
});

export default router;
