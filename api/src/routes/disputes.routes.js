// Dispute resolution module (spec §11, §30). Disputes are routed automatically to the lead
// authority by category; each authority sees only its own queue; the full case timeline is
// preserved; duplicate cases for the same issue are prevented.
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES, GOVERNANCE_ROLES } from "../middleware/auth.js";
import { Dispute, CredentialIndex, Issuer } from "../models/index.js";
import { logActivity } from "../services/activity.service.js";
import { notifyEmail, notifyIssuerOfficers, notifyRole } from "../services/notify.service.js";

const router = Router();

// Category → lead authority (spec §30). Compliance/accreditation categories go to the
// regulator of the credential's SECTOR — HEA for higher-ed, TEVETA for TEVET institutions.
const ROUTE = {
  ecz_result: "ecz",
  institution_compliance: "hea",
  programme_accreditation: "hea",
  zqf_level: "zaqa",
  national_recognition: "zaqa",
  award_details: "issuer", // issuing institution first
  other: "zaqa",
};
const SECTOR_ROUTED = new Set(["institution_compliance", "programme_accreditation"]);

async function leadAuthorityFor(category, cred) {
  let lead = ROUTE[category];
  if (SECTOR_ROUTED.has(category) && cred.issuer) {
    const issuer = await Issuer.findById(cred.issuer).select("sector").lean();
    if (issuer?.sector === "tevet") lead = "teveta";
  }
  return lead;
}

function view(d) {
  return {
    id: d._id, credentialHash: d.credentialHash, category: d.category, description: d.description,
    openedBy: d.openedByEmail, leadAuthority: d.leadAuthority, institution: d.institution,
    subjectName: d.subjectName, status: d.status, resolution: d.resolution,
    events: d.events, createdAt: d.createdAt,
  };
}

// POST /api/disputes — open a dispute (graduate, institution, or any authority).
const openSchema = Joi.object({
  credentialHash: Joi.string().pattern(/^0x[a-fA-F0-9]{64}$/).required(),
  category: Joi.string().valid(...Object.keys(ROUTE)).required(),
  description: Joi.string().min(3).max(1000).required(),
});
router.post("/", requireAuth, validate(openSchema), async (req, res, next) => {
  try {
    const { credentialHash, category, description } = req.body;
    const cred = await CredentialIndex.findOne({ credentialHash }).lean();
    if (!cred) return res.status(404).json({ error: "Credential not found" });
    // Prevent duplicate cases for the same issue (§30.1).
    if (await Dispute.findOne({ credentialHash, category, status: "open" })) {
      return res.status(409).json({ error: "A dispute for this issue is already open." });
    }
    const leadAuthority = await leadAuthorityFor(category, cred);
    const dispute = await Dispute.create({
      credentialHash, category, description,
      openedByEmail: req.user.email, openedByRole: req.user.role,
      leadAuthority,
      targetIssuer: leadAuthority === "issuer" ? cred.issuer : undefined,
      institution: cred.institution, subjectName: cred.subjectName,
      events: [{ at: new Date(), actor: req.user.email, action: "opened", note: description }],
    });
    await logActivity(req, { action: "dispute.open", entity: "dispute", entityId: String(dispute._id), summary: `Opened ${category.replace(/_/g, " ")} dispute on ${cred.subjectName}'s ${cred.qualification}` });
    // Notify the routed authority (§11 stage 5).
    if (leadAuthority === "issuer") await notifyIssuerOfficers(cred.issuer, `New dispute (${category.replace(/_/g, " ")}) on ${cred.subjectName}'s ${cred.qualification}.`);
    else await notifyRole(leadAuthority, `New dispute (${category.replace(/_/g, " ")}) on ${cred.subjectName}'s ${cred.qualification} from ${cred.institution}.`);
    res.status(201).json({ dispute: view(dispute) });
  } catch (err) { next(err); }
});

// GET /api/disputes/mine — disputes I opened.
router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const rows = await Dispute.find({ openedByEmail: req.user.email?.toLowerCase() }).sort({ createdAt: -1 }).lean();
    res.json({ disputes: rows.map(view) });
  } catch (err) { next(err); }
});

// GET /api/disputes/queue — the queue for MY authority (each authority sees only its own).
router.get("/queue", requireAuth, requireRole(...GOVERNANCE_ROLES, ROLES.ISSUER), async (req, res, next) => {
  try {
    let q;
    if (req.user.role === "admin") q = {}; // super admin oversight
    else if (req.user.role === "issuer") q = { leadAuthority: "issuer", targetIssuer: req.user.issuerId };
    else q = { leadAuthority: req.user.role };
    const rows = await Dispute.find(q).sort({ status: 1, createdAt: -1 }).limit(200).lean();
    res.json({ disputes: rows.map(view) });
  } catch (err) { next(err); }
});

// PATCH /api/disputes/:id/resolve — the lead authority resolves the case.
const resolveSchema = Joi.object({ resolution: Joi.string().min(3).max(1000).required() });
router.patch("/:id/resolve", requireAuth, requireRole(...GOVERNANCE_ROLES, ROLES.ISSUER), validate(resolveSchema), async (req, res, next) => {
  try {
    const d = await Dispute.findById(req.params.id);
    if (!d) return res.status(404).json({ error: "Dispute not found" });
    const allowed =
      req.user.role === "admin" ||
      (d.leadAuthority === "issuer" ? String(d.targetIssuer) === req.user.issuerId : d.leadAuthority === req.user.role);
    if (!allowed) return res.status(403).json({ error: "This dispute is owned by another authority." });
    if (d.status === "resolved") return res.status(400).json({ error: "Already resolved." });
    d.status = "resolved";
    d.resolution = req.body.resolution;
    d.events.push({ at: new Date(), actor: req.user.email, action: "resolved", note: req.body.resolution });
    await d.save();
    await logActivity(req, { action: "dispute.resolve", entity: "dispute", entityId: String(d._id), summary: `Resolved ${d.category.replace(/_/g, " ")} dispute on ${d.subjectName}` });
    await notifyEmail(d.openedByEmail, `Your dispute on ${d.subjectName}'s credential has been resolved: ${req.body.resolution}`);
    res.json({ dispute: view(d) });
  } catch (err) { next(err); }
});

export default router;
