// TEVETA — Technical Education, Vocational and Entrepreneurship Training Authority portal
// (regulator, NOT an issuer). Mirrors the HEA portal for the TEVET sector: registers TEVET
// institutions (trades schools, vocational colleges), approves/suspends their ability to issue
// on the platform, records accredited programmes, and monitors TEVET credential issuance.
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
import { pushEvent } from "../services/history.service.js";

const router = Router();
const tevetaOnly = [requireAuth, requireRole(ROLES.TEVETA, ROLES.ADMIN)];

function issuerView(i) {
  return {
    id: i._id,
    institution: i.institution,
    did: i.did,
    walletAddress: i.walletAddress,
    sector: i.sector,
    heaStatus: i.heaStatus || "approved", // regulator status field is shared across sectors
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

// POST /api/teveta/institutions — register a recognised TEVET institution as an issuer.
const createSchema = Joi.object({
  institution: Joi.string().min(2).max(120).required(),
  officerEmail: Joi.string().email().required(),
  officerPassword: Joi.string().min(8).required(),
  officerName: Joi.string().max(120).required(),
  metamaskAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional().allow(""),
  accreditedPrograms: Joi.array().items(Joi.string().max(160)).default([]),
});
router.post("/institutions", ...tevetaOnly, validate(createSchema), async (req, res, next) => {
  try {
    const { institution, officerEmail, officerPassword, officerName, metamaskAddress, accreditedPrograms } = req.body;
    const { issuer, officer } = await registerInstitution({
      institution, officerEmail, officerPassword, officerName, metamaskAddress,
      sector: "tevet", heaStatus: "approved",
    });
    if (accreditedPrograms?.length) issuer.accreditedPrograms = accreditedPrograms;
    pushEvent(issuer, req, "institution.registered", "Registered by TEVETA");
    await issuer.save();
    await logActivity(req, { action: "teveta.register", entity: "institution", entityId: String(issuer._id), summary: `Registered TEVET institution ${issuer.institution}` });
    res.status(201).json({
      issuer: issuerView(issuer),
      officer: { email: officer.email, name: officer.name },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/teveta/institutions — TEVET institution registry.
router.get("/institutions", ...tevetaOnly, async (_req, res, next) => {
  try {
    const issuers = await Issuer.find({ sector: "tevet" }).sort({ createdAt: -1 }).lean();
    res.json({ institutions: issuers.map(issuerView) });
  } catch (err) { next(err); }
});

// PATCH /api/teveta/institutions/:id/status — approve or suspend an institution.
const statusSchema = Joi.object({
  heaStatus: Joi.string().valid("approved", "suspended", "pending").required(),
  note: Joi.string().max(300).allow("").optional(),
});
router.patch("/institutions/:id/status", ...tevetaOnly, validate(statusSchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id);
    if (!issuer) return res.status(404).json({ error: "Institution not found" });
    if (issuer.sector !== "tevet") return res.status(400).json({ error: "This institution is not regulated by TEVETA." });
    const from = issuer.heaStatus || "approved"; // legacy issuers read as approved
    const to = req.body.heaStatus;
    issuer.heaStatus = to;
    issuer.heaNote = req.body.note || "";
    // A status PATCH to "suspended" is a suspension — distinct from a rejected application,
    // which stores the same status (see the reject route). The event records which it was.
    pushEvent(issuer, req, to === "suspended" ? "institution.suspended" : "institution.status_changed", req.body.note || undefined, { from, to });
    await issuer.save();
    await logActivity(req, {
      action: "teveta.status_change", entity: "institution", entityId: String(issuer._id),
      summary: to === "suspended"
        ? `Suspended institution ${issuer.institution}`
        : `Changed institution ${issuer.institution} status from ${from} to ${to}`,
    });
    res.json({ institution: issuerView(issuer) });
  } catch (err) { next(err); }
});

// PATCH /api/teveta/institutions/:id/programs — set accredited programmes.
const programsSchema = Joi.object({
  accreditedPrograms: Joi.array().items(Joi.string().max(160)).required(),
});
router.patch("/institutions/:id/programs", ...tevetaOnly, validate(programsSchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id);
    if (!issuer) return res.status(404).json({ error: "Institution not found" });
    if (issuer.sector !== "tevet") return res.status(400).json({ error: "This institution is not regulated by TEVETA." });
    const before = issuer.accreditedPrograms || [];
    const after = req.body.accreditedPrograms;
    const added = after.filter((p) => !before.includes(p));
    const removed = before.filter((p) => !after.includes(p));
    issuer.accreditedPrograms = after;
    pushEvent(issuer, req, "institution.programs_updated", undefined, { added, removed });
    await issuer.save();
    await logActivity(req, {
      action: "teveta.programs_update", entity: "institution", entityId: String(issuer._id),
      summary: `Updated accredited programs for ${issuer.institution} (added ${added.length}, removed ${removed.length})`,
    });
    res.json({ institution: issuerView(issuer) });
  } catch (err) { next(err); }
});

// GET /api/teveta/pending — self-registered TEVET institutions awaiting approval.
router.get("/pending", ...tevetaOnly, async (_req, res, next) => {
  try {
    const issuers = await Issuer.find({ sector: "tevet", heaStatus: "pending" })
      .sort({ createdAt: -1 }).lean();
    res.json({ pending: issuers.map(issuerView) });
  } catch (err) { next(err); }
});

// POST /api/teveta/institutions/:id/approve — approve a pending institution. This authorises it
// on-chain (2-of-3 GovernanceSafe) so it can start issuing credentials.
router.post("/institutions/:id/approve", ...tevetaOnly, async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id);
    if (!issuer) return res.status(404).json({ error: "Institution not found" });
    if (issuer.sector !== "tevet") {
      return res.status(400).json({ error: "Only TEVET institutions are approved by TEVETA (HE → HEA, secondary → ECZ)." });
    }
    const from = issuer.heaStatus || "approved"; // legacy issuers read as approved
    issuer.heaStatus = "approved";
    issuer.approvedBy = req.user.role === "admin" ? "admin" : "TEVETA";
    issuer.rejectedReason = "";
    pushEvent(issuer, req, "institution.accreditation_approved", undefined, { from, to: "approved" });
    await issuer.save();
    await logActivity(req, { action: "teveta.approve", entity: "institution", entityId: String(issuer._id), summary: `Approved institution ${issuer.institution}` });
    // Authorise on-chain if not already (self-registered institutions arrive un-authorised).
    if (!issuer.onChain) {
      try { await authorizeIssuerOnChain(issuer); }
      catch (e) { return res.status(200).json({ institution: issuerView(issuer), warning: `Approved, but on-chain authorisation is pending: ${e.message}` }); }
    }
    await notifyIssuerOfficers(issuer._id, `Your institution ${issuer.institution} has been accredited by TEVETA. You can now issue credentials and download your accreditation certificate.`);
    res.json({ institution: issuerView(issuer) });
  } catch (err) { next(err); }
});

// POST /api/teveta/institutions/:id/reject — reject a pending institution.
const rejectSchema = Joi.object({ reason: Joi.string().max(300).allow("").optional() });
router.post("/institutions/:id/reject", ...tevetaOnly, validate(rejectSchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id);
    if (!issuer) return res.status(404).json({ error: "Institution not found" });
    if (issuer.sector !== "tevet") return res.status(400).json({ error: "This institution is not regulated by TEVETA." });
    const from = issuer.heaStatus || "approved"; // legacy issuers read as approved
    // Stored status stays "suspended" (the web app depends on it); the event records that this
    // was a rejected application, not a suspension of an approved institution.
    issuer.heaStatus = "suspended";
    issuer.rejectedReason = req.body.reason || "";
    issuer.heaNote = req.body.reason || "Rejected by TEVETA";
    pushEvent(issuer, req, "institution.accreditation_rejected", req.body.reason || undefined, { from, to: "suspended" });
    await issuer.save();
    await logActivity(req, { action: "teveta.reject", entity: "institution", entityId: String(issuer._id), summary: `Rejected institution ${issuer.institution}` });
    res.json({ institution: issuerView(issuer) });
  } catch (err) { next(err); }
});

// GET /api/teveta/institutions/:id/accreditation — stream the uploaded accreditation document.
router.get("/institutions/:id/accreditation", ...tevetaOnly, async (req, res, next) => {
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

// GET /api/teveta/institutions/:id/accreditation-certificate — TEVETA accreditation certificate PDF.
router.get("/institutions/:id/accreditation-certificate", ...tevetaOnly, async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id).lean();
    if (!issuer) return res.status(404).json({ error: "Institution not found" });
    if ((issuer.heaStatus || "approved") !== "approved") {
      return res.status(403).json({ error: "Institution is not TEVETA-approved." });
    }
    const pdf = await buildAccreditationCertificate(issuer);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="TEVETA-accreditation-${issuer.institution?.replace(/\s+/g, "_")}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

// GET /api/teveta/monitoring — TEVET credential issuance activity across institutions.
router.get("/monitoring", ...tevetaOnly, async (_req, res, next) => {
  try {
    const tevetInstitutions = await Issuer.find({ sector: "tevet" }).select("_id").lean();
    const ids = tevetInstitutions.map((i) => i._id);
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
