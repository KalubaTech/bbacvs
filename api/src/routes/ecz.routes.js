// ECZ — Examinations Council of Zambia portal (regulator side).
// ECZ regulates SECONDARY institutions: it approves/suspends self-registered secondary schools
// so they can issue on the platform, and reviews their accreditation documents. (ECZ also
// issues secondary certificates directly — that runs through the credentials routes.)
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES } from "../middleware/auth.js";
import { Issuer, CredentialIndex } from "../models/index.js";
import { authorizeIssuerOnChain } from "../services/issuerRegistration.service.js";
import { fetchByCid } from "../services/ipfs.service.js";
import { logActivity } from "../services/activity.service.js";
import { pushEvent } from "../services/history.service.js";

const router = Router();
const eczOnly = [requireAuth, requireRole(ROLES.ECZ, ROLES.ADMIN)];

function issuerView(i) {
  return {
    id: i._id, institution: i.institution, did: i.did, walletAddress: i.walletAddress,
    sector: i.sector, status: i.heaStatus || "approved", note: i.heaNote,
    onChain: i.onChain, zaqaTrusted: !!i.zaqaTrusted, selfRegistered: !!i.selfRegistered,
    hasAccreditationDoc: !!i.accreditationCid, approvedBy: i.approvedBy, createdAt: i.createdAt,
  };
}

// GET /api/ecz/institutions — all secondary-sector institutions (schools + the ECZ authority).
router.get("/institutions", ...eczOnly, async (_req, res, next) => {
  try {
    const issuers = await Issuer.find({ sector: "secondary" }).sort({ createdAt: -1 }).lean();
    res.json({ institutions: issuers.map(issuerView) });
  } catch (err) { next(err); }
});

// GET /api/ecz/pending — self-registered secondary schools awaiting ECZ approval.
router.get("/pending", ...eczOnly, async (_req, res, next) => {
  try {
    const issuers = await Issuer.find({ sector: "secondary", heaStatus: "pending" })
      .sort({ createdAt: -1 }).lean();
    res.json({ pending: issuers.map(issuerView) });
  } catch (err) { next(err); }
});

// POST /api/ecz/institutions/:id/approve — approve + authorise on-chain.
router.post("/institutions/:id/approve", ...eczOnly, async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id);
    if (!issuer) return res.status(404).json({ error: "Institution not found" });
    if (issuer.sector !== "secondary") return res.status(400).json({ error: "Higher-ed institutions are approved by HEA, not ECZ." });
    const from = issuer.heaStatus || "approved"; // legacy issuers read as approved
    issuer.heaStatus = "approved";
    issuer.approvedBy = req.user.role === "admin" ? "admin" : "ECZ";
    issuer.rejectedReason = "";
    pushEvent(issuer, req, "institution.accreditation_approved", undefined, { from, to: "approved" });
    await issuer.save();
    await logActivity(req, { action: "ecz.approve", entity: "institution", entityId: String(issuer._id), summary: `Approved institution ${issuer.institution}` });
    if (!issuer.onChain) {
      try { await authorizeIssuerOnChain(issuer); }
      catch (e) { return res.status(200).json({ institution: issuerView(issuer), warning: `Approved, but on-chain authorisation is pending: ${e.message}` }); }
    }
    res.json({ institution: issuerView(issuer) });
  } catch (err) { next(err); }
});

// POST /api/ecz/institutions/:id/reject
const rejectSchema = Joi.object({ reason: Joi.string().max(300).allow("").optional() });
router.post("/institutions/:id/reject", ...eczOnly, validate(rejectSchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id);
    if (!issuer) return res.status(404).json({ error: "Institution not found" });
    const from = issuer.heaStatus || "approved"; // legacy issuers read as approved
    // Stored status stays "suspended" (the web app depends on it); the event records that this
    // was a rejected application, not a suspension of an approved institution.
    issuer.heaStatus = "suspended";
    issuer.rejectedReason = req.body.reason || "";
    issuer.heaNote = req.body.reason || "Rejected by ECZ";
    pushEvent(issuer, req, "institution.accreditation_rejected", req.body.reason || undefined, { from, to: "suspended" });
    await issuer.save();
    await logActivity(req, { action: "ecz.reject", entity: "institution", entityId: String(issuer._id), summary: `Rejected institution ${issuer.institution}` });
    res.json({ institution: issuerView(issuer) });
  } catch (err) { next(err); }
});

// GET /api/ecz/institutions/:id/accreditation — stream the uploaded accreditation document.
router.get("/institutions/:id/accreditation", ...eczOnly, async (req, res, next) => {
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

export default router;
