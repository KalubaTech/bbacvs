// HEA — Higher Education Authority portal (regulator, NOT an issuer).
// Registers higher-education institutions, approves/suspends their ability to issue on the
// platform, records accredited programs, and monitors higher-ed credential issuance.
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES } from "../middleware/auth.js";
import { Issuer, CredentialIndex } from "../models/index.js";
import { registerInstitution, authorizeIssuerOnChain } from "../services/issuerRegistration.service.js";
import { fetchByCid } from "../services/ipfs.service.js";
import { buildAccreditationCertificate } from "../services/accreditationCert.service.js";
import { notifyIssuerOfficers } from "../services/notify.service.js";
import { logActivity } from "../services/activity.service.js";

const router = Router();
const heaOnly = [requireAuth, requireRole(ROLES.HEA, ROLES.ADMIN)];

function issuerView(i) {
  return {
    id: i._id,
    institution: i.institution,
    did: i.did,
    walletAddress: i.walletAddress,
    sector: i.sector,
    heaStatus: i.heaStatus || "approved", // legacy issuers read as approved
    heaNote: i.heaNote,
    accreditedPrograms: i.accreditedPrograms || [],
    zaqaTrusted: !!i.zaqaTrusted,
    onChain: i.onChain,
    registrationTx: i.registrationTx,
    selfRegistered: !!i.selfRegistered,
    hasAccreditationDoc: !!i.accreditationCid,
    approvedBy: i.approvedBy,
    createdAt: i.createdAt,
  };
}

// POST /api/hea/institutions — register a recognised higher-education institution as an issuer.
const createSchema = Joi.object({
  institution: Joi.string().min(2).max(120).required(),
  officerEmail: Joi.string().email().required(),
  officerPassword: Joi.string().min(8).required(),
  officerName: Joi.string().max(120).required(),
  metamaskAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional().allow(""),
  accreditedPrograms: Joi.array().items(Joi.string().max(160)).default([]),
});
router.post("/institutions", ...heaOnly, validate(createSchema), async (req, res, next) => {
  try {
    const { institution, officerEmail, officerPassword, officerName, metamaskAddress, accreditedPrograms } = req.body;
    const { issuer, officer } = await registerInstitution({
      institution, officerEmail, officerPassword, officerName, metamaskAddress,
      sector: "higher_ed", heaStatus: "approved",
    });
    if (accreditedPrograms?.length) {
      issuer.accreditedPrograms = accreditedPrograms;
      await issuer.save();
    }
    res.status(201).json({
      issuer: issuerView(issuer),
      officer: { email: officer.email, name: officer.name },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/hea/institutions — higher-education institution registry.
router.get("/institutions", ...heaOnly, async (_req, res, next) => {
  try {
    const issuers = await Issuer.find({ sector: { $nin: ["secondary", "tevet"] } }).sort({ createdAt: -1 }).lean();
    res.json({ institutions: issuers.map(issuerView) });
  } catch (err) { next(err); }
});

// PATCH /api/hea/institutions/:id/status — approve or suspend an institution.
const statusSchema = Joi.object({
  heaStatus: Joi.string().valid("approved", "suspended", "pending").required(),
  note: Joi.string().max(300).allow("").optional(),
});
router.patch("/institutions/:id/status", ...heaOnly, validate(statusSchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id);
    if (!issuer) return res.status(404).json({ error: "Institution not found" });
    issuer.heaStatus = req.body.heaStatus;
    issuer.heaNote = req.body.note || "";
    await issuer.save();
    res.json({ institution: issuerView(issuer) });
  } catch (err) { next(err); }
});

// PATCH /api/hea/institutions/:id/programs — set accredited programs.
const programsSchema = Joi.object({
  accreditedPrograms: Joi.array().items(Joi.string().max(160)).required(),
});
router.patch("/institutions/:id/programs", ...heaOnly, validate(programsSchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id);
    if (!issuer) return res.status(404).json({ error: "Institution not found" });
    issuer.accreditedPrograms = req.body.accreditedPrograms;
    await issuer.save();
    res.json({ institution: issuerView(issuer) });
  } catch (err) { next(err); }
});

// GET /api/hea/pending — self-registered higher-ed institutions awaiting approval.
router.get("/pending", ...heaOnly, async (_req, res, next) => {
  try {
    const issuers = await Issuer.find({ sector: { $nin: ["secondary", "tevet"] }, heaStatus: "pending" })
      .sort({ createdAt: -1 }).lean();
    res.json({ pending: issuers.map(issuerView) });
  } catch (err) { next(err); }
});

// POST /api/hea/institutions/:id/approve — approve a pending institution. This authorises it
// on-chain (2-of-3 GovernanceSafe) so it can start issuing credentials.
router.post("/institutions/:id/approve", ...heaOnly, async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id);
    if (!issuer) return res.status(404).json({ error: "Institution not found" });
    if (issuer.sector === "secondary") return res.status(400).json({ error: "Secondary institutions are approved by ECZ, not HEA." });
    if (issuer.sector === "tevet") return res.status(400).json({ error: "TEVET institutions are approved by TEVETA, not HEA." });
    issuer.heaStatus = "approved";
    issuer.approvedBy = req.user.role === "admin" ? "admin" : "HEA";
    issuer.rejectedReason = "";
    await issuer.save();
    // Authorise on-chain if not already (self-registered institutions arrive un-authorised).
    if (!issuer.onChain) {
      try { await authorizeIssuerOnChain(issuer); }
      catch (e) { return res.status(200).json({ institution: issuerView(issuer), warning: `Approved, but on-chain authorisation is pending: ${e.message}` }); }
    }
    await logActivity(req, { action: "hea.approve", entity: "institution", entityId: String(issuer._id), summary: `Approved institution ${issuer.institution}` });
    await notifyIssuerOfficers(issuer._id, `Your institution ${issuer.institution} has been accredited by the HEA. You can now issue credentials and download your accreditation certificate.`);
    res.json({ institution: issuerView(issuer) });
  } catch (err) { next(err); }
});

// POST /api/hea/institutions/:id/reject — reject a pending institution.
const rejectSchema = Joi.object({ reason: Joi.string().max(300).allow("").optional() });
router.post("/institutions/:id/reject", ...heaOnly, validate(rejectSchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id);
    if (!issuer) return res.status(404).json({ error: "Institution not found" });
    issuer.heaStatus = "suspended";
    issuer.rejectedReason = req.body.reason || "";
    issuer.heaNote = req.body.reason || "Rejected by HEA";
    await issuer.save();
    await logActivity(req, { action: "hea.reject", entity: "institution", entityId: String(issuer._id), summary: `Rejected institution ${issuer.institution}` });
    res.json({ institution: issuerView(issuer) });
  } catch (err) { next(err); }
});

// GET /api/hea/institutions/:id/accreditation — stream the uploaded accreditation document.
router.get("/institutions/:id/accreditation", ...heaOnly, async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id).lean();
    if (!issuer?.accreditationCid) return res.status(404).json({ error: "No accreditation document" });
    const doc = await fetchByCid(issuer.accreditationCid);
    const buf = Buffer.from(doc.data, "base64");
    res.setHeader("Content-Type", issuer.accreditationMime || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${issuer.accreditationName || "accreditation"}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

// GET /api/hea/institutions/:id/accreditation-certificate — HEA accreditation certificate PDF.
router.get("/institutions/:id/accreditation-certificate", ...heaOnly, async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id).lean();
    if (!issuer) return res.status(404).json({ error: "Institution not found" });
    if ((issuer.heaStatus || "approved") !== "approved") {
      return res.status(403).json({ error: "Institution is not HEA-approved." });
    }
    const pdf = await buildAccreditationCertificate(issuer);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="HEA-accreditation-${issuer.institution?.replace(/\s+/g, "_")}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

// GET /api/hea/monitoring — higher-ed credential issuance activity across institutions.
router.get("/monitoring", ...heaOnly, async (_req, res, next) => {
  try {
    const heInstitutions = await Issuer.find({ sector: { $nin: ["secondary", "tevet"] } }).select("_id").lean();
    const ids = heInstitutions.map((i) => i._id);
    const rows = await CredentialIndex.find({ issuer: { $in: ids } }).sort({ createdAt: -1 }).limit(200).lean();
    const byInstitution = {};
    for (const r of rows) {
      const k = r.institution || "—";
      byInstitution[k] = byInstitution[k] || { institution: k, total: 0, active: 0, revoked: 0 };
      byInstitution[k].total++;
      if (r.status === "active") byInstitution[k].active++;
      if (r.status === "revoked") byInstitution[k].revoked++;
    }
    res.json({
      summary: Object.values(byInstitution),
      recent: rows.slice(0, 50).map((r) => ({
        credentialHash: r.credentialHash, institution: r.institution, subjectName: r.subjectName,
        qualification: r.qualification, credentialType: r.credentialType, zqfLevel: r.zqfLevel,
        status: r.status, issuedAt: r.issuedAt,
      })),
    });
  } catch (err) { next(err); }
});

export default router;
