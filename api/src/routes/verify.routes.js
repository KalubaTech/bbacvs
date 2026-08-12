import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { verifyOnChain } from "../services/web3.service.js";
import { verifyOffline, buildSignedPayload, renderQR } from "../services/signedQr.service.js";
import { buildVerificationCertificatePDF } from "../services/pdf.service.js";
import { CredentialIndex, Issuer } from "../models/index.js";
import { config } from "../config/index.js";

const router = Router();

const RECOGNISED_AS = {
  secondary: "Secondary School Certificate", diploma: "Diploma", degree: "Degree",
  masters: "Master's Degree", phd: "Doctor of Philosophy (PhD)", other: "Qualification",
};

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
            regulator: issuerRec.sector === "secondary" ? "ECZ" : "HEA",
            heaStatus: issuerRec.sector === "secondary" ? null : (issuerRec.heaStatus || "approved"),
            zaqaTrusted: !!issuerRec.zaqaTrusted, // in ZAQA national trusted-issuer registry
            onChainAuthorised: !!issuerRec.onChain,
          }
        : null,
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
  const { payload, issuerPubKey } = req.body;
  const valid = verifyOffline(payload, issuerPubKey);
  res.json({
    status: valid ? "OFFLINE_VERIFIED" : "INVALID",
    issuer: payload.cred_did,
    note: "Offline confirms issuer authenticity + QR integrity; revocation needs later online re-check.",
  });
});

export default router;
