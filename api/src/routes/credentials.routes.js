import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES, ISSUING_ROLES } from "../middleware/auth.js";
import { Issuer, CredentialIndex } from "../models/index.js";
import { decryptKey } from "../services/keystore.service.js";
import { anchorCredentialAs, revokeCredentialAs, verifyOnChain } from "../services/web3.service.js";
import { renderQR } from "../services/signedQr.service.js";
import { prepareCredential, indexCredential } from "../services/issuance.service.js";
import { buildCertificatePDF, buildTranscriptPDF } from "../services/pdf.service.js";
import { logActivity } from "../services/activity.service.js";
import { runValidationChecks } from "../services/validationEngine.service.js";
import { notifyRole, notifyEmail } from "../services/notify.service.js";
import { buildAccreditationCertificate } from "../services/accreditationCert.service.js";
import { config } from "../config/index.js";

const router = Router();

// Regulator-approval gate: an institution must be approved by its regulator to issue —
// HEA for higher-ed, TEVETA for TEVET, ECZ for secondary. Legacy issuers (heaStatus undefined) pass.
function approvalGate(issuer) {
  const regulator = issuer.sector === "secondary" ? "ECZ" : issuer.sector === "tevet" ? "TEVETA" : "HEA";
  if (issuer.heaStatus === "suspended") return `This institution has been suspended by the ${regulator} and cannot issue credentials.`;
  if (issuer.heaStatus === "pending") return `This institution is awaiting ${regulator} approval before it can issue credentials.`;
  return null;
}

// The kind of qualification is fixed for the secondary sector (ECZ) and free-form for HE.
function resolveCredentialType(issuer, requested) {
  if (issuer.sector === "secondary") return "secondary";
  return requested || "other";
}

// POST /api/credentials/issue (issuer/ECZ) — issue a credential to a graduate, identified by
// email. The holder DID is resolved from their account (or generated) — never entered by hand.
// zqfLevel + credentialType record the national qualification level & kind (ECZ = secondary).
const issueSchema = Joi.object({
  holderEmail: Joi.string().email().required(),
  claims: Joi.object({
    name: Joi.string().required(),
    nationalId: Joi.string().max(40).allow("").optional(), // NRC / passport (optional)
    qualification: Joi.string().required(),
    graduationYear: Joi.number().integer().min(1960).max(2100).required(),
  }).required(),
  zqfLevel: Joi.number().integer().min(1).max(10).optional(),
  credentialType: Joi.string().valid("secondary", "diploma", "degree", "masters", "phd", "other").optional(),
});
// Server-side anchoring (server mode). The API signs the issueCredential tx.
router.post("/issue", requireAuth, requireRole(...ISSUING_ROLES), validate(issueSchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.user.issuerId);
    if (!issuer) return res.status(403).json({ error: "Issuer profile not found" });
    const gate = approvalGate(issuer);
    if (gate) return res.status(403).json({ error: gate });
    if (issuer.signingMode !== "server") {
      return res.status(400).json({ error: "This issuer signs with MetaMask — use /prepare then /finalize." });
    }
    const { holderEmail, claims, zqfLevel, credentialType } = req.body;
    const meta = { zqfLevel, credentialType: resolveCredentialType(issuer, credentialType) };
    const prep = await prepareCredential(issuer, holderEmail, claims);
    const anchor = await anchorCredentialAs(decryptKey(issuer.encPrivateKey), prep.credentialHash, prep.cidHash);
    await indexCredential(issuer, holderEmail, claims, prep, { status: "active", anchorTx: anchor.txHash, meta });
    await logActivity(req, { action: "credential.issue", entity: "credential", entityId: prep.credentialHash, summary: `Issued ${claims.qualification} to ${claims.name}` });
    res.status(201).json({
      credentialHash: prep.credentialHash, cid: prep.cid, institution: issuer.institution,
      anchor, qrPayload: prep.qrPayload, qrImage: await renderQR(prep.qrPayload),
    });
  } catch (err) { next(err); }
});

// MetaMask flow, step 1 — server does all off-chain work, stores a PENDING record, and
// returns the (hash, cidHash) for the institution to anchor themselves via MetaMask.
router.post("/prepare", requireAuth, requireRole(...ISSUING_ROLES), validate(issueSchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.user.issuerId);
    if (!issuer) return res.status(403).json({ error: "Issuer profile not found" });
    const gate = approvalGate(issuer);
    if (gate) return res.status(403).json({ error: gate });
    const { holderEmail, claims, zqfLevel, credentialType } = req.body;
    const meta = { zqfLevel, credentialType: resolveCredentialType(issuer, credentialType) };
    const prep = await prepareCredential(issuer, holderEmail, claims);
    await indexCredential(issuer, holderEmail, claims, prep, { status: "pending", anchorTx: null, meta });
    res.json({
      credentialHash: prep.credentialHash,
      cidHash: prep.cidHash,
      cid: prep.cid,
      credentialRegistry: config.chain.credentialRegistry, // contract the client calls
      issuerAddress: issuer.walletAddress,                  // MetaMask must be this account
    });
  } catch (err) { next(err); }
});

// MetaMask flow, step 2 — after the institution's MetaMask anchors the tx, confirm it's
// on-chain and activate the credential.
const finalizeSchema = Joi.object({
  credentialHash: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).required(),
  txHash: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).required(),
});
router.post("/finalize", requireAuth, requireRole(...ISSUING_ROLES), validate(finalizeSchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.user.issuerId);
    const { credentialHash, txHash } = req.body;
    const cred = await CredentialIndex.findOne({ credentialHash, issuer: issuer._id });
    if (!cred) return res.status(404).json({ error: "Prepared credential not found" });

    // Authoritative check: the anchor must actually exist on-chain and verify.
    const onchain = await verifyOnChain(credentialHash);
    if (onchain.status !== "VERIFIED") {
      return res.status(400).json({ error: "Anchor not confirmed on-chain yet — retry shortly." });
    }
    cred.status = "active"; cred.anchorTx = txHash; await cred.save();
    res.status(201).json({
      credentialHash, cid: cred.cid, institution: issuer.institution,
      qrPayload: cred.qrPayload, qrImage: await renderQR(cred.qrPayload), anchor: { txHash },
    });
  } catch (err) { next(err); }
});

// GET /api/credentials/issuer-profile (issuer/ECZ) — how this issuer signs + its wallet + status.
router.get("/issuer-profile", requireAuth, requireRole(...ISSUING_ROLES), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.user.issuerId).lean();
    if (!issuer) return res.status(404).json({ error: "Issuer profile not found" });
    res.json({
      institution: issuer.institution, walletAddress: issuer.walletAddress,
      signingMode: issuer.signingMode, did: issuer.did, onChain: issuer.onChain,
      sector: issuer.sector, heaStatus: issuer.heaStatus || "approved",
      heaNote: issuer.heaNote, zaqaTrusted: !!issuer.zaqaTrusted,
      accreditedPrograms: issuer.accreditedPrograms || [],
    });
  } catch (err) { next(err); }
});

// GET /api/credentials/accreditation-certificate (issuer) — the institution downloads its own
// HEA accreditation certificate (available once HEA-approved).
router.get("/accreditation-certificate", requireAuth, requireRole(...ISSUING_ROLES), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.user.issuerId).lean();
    if (!issuer) return res.status(404).json({ error: "Issuer profile not found" });
    if ((issuer.heaStatus || "approved") !== "approved") {
      return res.status(403).json({ error: "Your institution is not yet approved." });
    }
    const pdf = await buildAccreditationCertificate(issuer);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="accreditation-certificate.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

// GET /api/credentials/mine (issuer/ECZ) — credentials this institution issued.
router.get("/mine", requireAuth, requireRole(...ISSUING_ROLES), async (req, res, next) => {
  try {
    const rows = await CredentialIndex.find({ issuer: req.user.issuerId }).sort({ createdAt: -1 }).lean();
    res.json({ credentials: rows.map(publicRow) });
  } catch (err) { next(err); }
});

// GET /api/credentials/holder (holder) — credentials issued to me (by DID or email).
router.get("/holder", requireAuth, requireRole(ROLES.HOLDER), async (req, res, next) => {
  try {
    const or = [{ holderDID: req.user.holderDID }];
    if (req.user.email) or.push({ holderEmail: req.user.email.toLowerCase() });
    const rows = await CredentialIndex.find({ status: { $ne: "pending" }, $or: or })
      .sort({ createdAt: -1 }).lean();
    res.json({ credentials: rows.map(publicRow) });
  } catch (err) { next(err); }
});

// POST /api/credentials/revoke (issuer)
const revokeSchema = Joi.object({
  credentialHash: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).required(),
  reasonCode: Joi.number().integer().min(1).max(5).required(),
});
router.post("/revoke", requireAuth, requireRole(...ISSUING_ROLES), validate(revokeSchema), async (req, res, next) => {
  try {
    const { credentialHash, reasonCode } = req.body;
    const cred = await CredentialIndex.findOne({ credentialHash, issuer: req.user.issuerId });
    if (!cred) return res.status(404).json({ error: "Credential not found for this issuer" });
    const issuer = await Issuer.findById(req.user.issuerId);
    const tx = await revokeCredentialAs(decryptKey(issuer.encPrivateKey), credentialHash, reasonCode);
    cred.status = "revoked"; cred.reasonCode = reasonCode; await cred.save();
    await logActivity(req, { action: "credential.revoke", entity: "credential", entityId: cred.credentialHash, summary: `Revoked ${cred.subjectName}'s ${cred.qualification}` });
    res.json({ status: "revoked", reasonCode, tx });
  } catch (err) { next(err); }
});

// POST /api/credentials/:hash/request-correction (holder) — graduate raises a correction/appeal.
// Surfaces to the issuer and to ZAQA's dispute oversight; never mutates on-chain state.
const correctionSchema = Joi.object({
  message: Joi.string().min(3).max(1000).required(),
});
router.post("/:hash/request-correction", requireAuth, requireRole(ROLES.HOLDER), validate(correctionSchema), async (req, res, next) => {
  try {
    const cred = await CredentialIndex.findOne({ credentialHash: req.params.hash });
    if (!cred) return res.status(404).json({ error: "Credential not found" });
    // Only the credential's own holder may raise a correction.
    const mine = cred.holderDID === req.user.holderDID ||
      (req.user.email && cred.holderEmail === req.user.email.toLowerCase());
    if (!mine) return res.status(403).json({ error: "Not your credential" });
    cred.correctionRequest = {
      status: "open", message: req.body.message, requestedAt: new Date(),
    };
    await cred.save();
    res.json({ credentialHash: cred.credentialHash, correctionRequest: cred.correctionRequest });
  } catch (err) { next(err); }
});

// POST /api/credentials/:hash/submit (issuer/ECZ) — submit a DRAFT credential to ZAQA for
// national validation. Moves it into the ZAQA validation queue (PENDING_ZAQA_VALIDATION).
router.post("/:hash/submit", requireAuth, requireRole(...ISSUING_ROLES), async (req, res, next) => {
  try {
    const cred = await CredentialIndex.findOne({ credentialHash: req.params.hash, issuer: req.user.issuerId });
    if (!cred) return res.status(404).json({ error: "Credential not found for this issuer" });
    if (cred.zaqaValidation !== "draft") {
      return res.status(400).json({ error: `Already submitted (status: ${cred.zaqaValidation}).` });
    }
    cred.zaqaValidation = "pending";
    // Run the automated checks now so the ZAQA officer receives a full decision pack (§6).
    cred.validationReport = await runValidationChecks(cred);
    await cred.save();
    await logActivity(req, { action: "credential.submit", entity: "credential", entityId: cred.credentialHash, summary: `Submitted ${cred.subjectName}'s ${cred.qualification} to ZAQA` });
    await notifyRole("zaqa", `New credential submitted for validation: ${cred.subjectName} — ${cred.qualification} (${cred.institution}). Automated risk: ${cred.validationReport.risk}.`);
    res.json({ credentialHash: cred.credentialHash, zaqaValidation: cred.zaqaValidation, validationReport: cred.validationReport });
  } catch (err) { next(err); }
});

// GET /api/credentials/:hash/qr — signed QR image (holder or issuer).
router.get("/:hash/qr", requireAuth, async (req, res, next) => {
  try {
    const cred = await CredentialIndex.findOne({ credentialHash: req.params.hash }).lean();
    if (!cred) return res.status(404).json({ error: "Not found" });
    // Ensure the full hash rides in the QR even for credentials issued before that change.
    const payload = { ...cred.qrPayload, hash: cred.credentialHash };
    res.json({ qrPayload: payload, qrImage: await renderQR(payload) });
  } catch (err) { next(err); }
});

// GET /api/credentials/:hash/pdf — PDF certificate download.
router.get("/:hash/pdf", requireAuth, async (req, res, next) => {
  try {
    const cred = await CredentialIndex.findOne({ credentialHash: req.params.hash }).lean();
    if (!cred) return res.status(404).json({ error: "Not found" });
    const qrImage = await renderQR({ ...cred.qrPayload, hash: cred.credentialHash });
    const pdf = await buildCertificatePDF(cred, qrImage);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="credential-${req.params.hash.slice(0, 10)}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

// GET /api/credentials/:hash/transcript (issuer/ECZ) — a simple academic transcript PDF for the
// graduate this credential belongs to, listing all credentials this institution issued them.
router.get("/:hash/transcript", requireAuth, requireRole(...ISSUING_ROLES), async (req, res, next) => {
  try {
    const cred = await CredentialIndex.findOne({ credentialHash: req.params.hash, issuer: req.user.issuerId }).lean();
    if (!cred) return res.status(404).json({ error: "Credential not found for this issuer" });
    const issuer = await Issuer.findById(req.user.issuerId).lean();
    // Gather every credential this institution issued to the same graduate.
    const or = [{ holderDID: cred.holderDID }];
    if (cred.holderEmail) or.push({ holderEmail: cred.holderEmail });
    const rows = await CredentialIndex.find({ issuer: req.user.issuerId, status: { $ne: "pending" }, $or: or })
      .sort({ graduationYear: 1 }).lean();
    const pdf = await buildTranscriptPDF({ institution: issuer?.institution, cred, rows });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="transcript-${cred.subjectName?.replace(/\s+/g, "_") || "graduate"}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

function publicRow(r) {
  return {
    credentialHash: r.credentialHash, cid: r.cid, institution: r.institution,
    subjectName: r.subjectName, holderNationalId: r.holderNationalId,
    qualification: r.qualification, graduationYear: r.graduationYear,
    zqfLevel: r.zqfLevel, credentialType: r.credentialType,
    status: r.status, zaqaValidation: r.zaqaValidation, zaqaRef: r.zaqaRef,
    zaqaValidatedAt: r.zaqaValidatedAt, holderDID: r.holderDID,
    issuedAt: r.issuedAt, anchorTx: r.anchorTx, correctionRequest: r.correctionRequest,
  };
}

export default router;
