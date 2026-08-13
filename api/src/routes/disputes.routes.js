// Dispute resolution module (spec §11, §30). Disputes are routed automatically to the lead
// authority by category; each authority sees only its own queue; the full case timeline is
// preserved; duplicate cases for the same issue are prevented.
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES, GOVERNANCE_ROLES } from "../middleware/auth.js";
import { Dispute, CredentialIndex, Issuer, NQFVersion } from "../models/index.js";
import { logActivity } from "../services/activity.service.js";
import { makeEvent, pushEvent } from "../services/history.service.js";
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
    decidedBy: d.decidedBy, decidedAt: d.decidedAt, appeal: d.appeal,
    events: d.events, createdAt: d.createdAt,
  };
}

/** True when the requester's authority owns this dispute (admin oversees everything). */
function ownsDispute(req, d) {
  return (
    req.user.role === "admin" ||
    (d.leadAuthority === "issuer" ? String(d.targetIssuer) === req.user.issuerId : d.leadAuthority === req.user.role)
  );
}

// Statuses in which a case is still live (used for duplicate prevention + decision guards).
const ACTIVE_STATUSES = ["open", "under_review", "awaiting_evidence"];

/**
 * Apply the credential-side effect of a decision (spec §11): an upheld complaint flags the
 * credential "suspicious" so ZAQA reviews it in the validation queue; a dismissed complaint
 * restores the credential from "under_dispute" to its pre-dispute state.
 */
async function applyCredentialEffect(req, d, outcome) {
  if (!d.credentialHash) return;
  const cred = await CredentialIndex.findOne({ credentialHash: d.credentialHash });
  if (!cred) return;
  const from = cred.zaqaValidation;
  if (outcome === "upheld") {
    if (from === "suspicious") return;
    cred.zaqaValidation = "suspicious";
    pushEvent(cred, req, "credential.dispute_upheld", "Dispute upheld — flagged for ZAQA review", {
      from, to: "suspicious", disputeId: String(d._id), officer: req.user.email,
    });
    await cred.save();
  } else {
    // dismissed — only restore if the dispute is what put the credential under dispute
    if (from !== "under_dispute") return;
    const to = cred.zaqaRef ? "validated" : "pending";
    cred.zaqaValidation = to;
    pushEvent(cred, req, "credential.dispute_dismissed", "Dispute dismissed — pre-dispute state restored", {
      from, to, disputeId: String(d._id), officer: req.user.email,
    });
    await cred.save();
  }
}

/**
 * Reverse the credential-side effect of the ORIGINAL decision when an appeal is upheld:
 * an overturned "upheld" clears the suspicion flag; an overturned "dismissed" (or legacy
 * "resolved") means the complaint was justified after all — the credential is flagged.
 */
async function reverseCredentialEffect(req, d) {
  if (!d.credentialHash) return;
  const cred = await CredentialIndex.findOne({ credentialHash: d.credentialHash });
  if (!cred) return;
  const decided = [...(d.events || [])].reverse().find((e) => e.action === "dispute.decided");
  const original = decided?.meta?.result || "dismissed"; // legacy "resolved" closures ≈ dismissed
  const from = cred.zaqaValidation;
  if (original === "upheld") {
    if (from !== "suspicious") return;
    const to = cred.zaqaRef ? "validated" : "pending";
    cred.zaqaValidation = to;
    pushEvent(cred, req, "credential.dispute_appeal_upheld", "Appeal upheld — suspicion flag cleared", {
      from, to, disputeId: String(d._id), officer: req.user.email,
    });
  } else {
    if (from === "suspicious") return;
    cred.zaqaValidation = "suspicious";
    pushEvent(cred, req, "credential.dispute_appeal_upheld", "Appeal upheld — flagged for ZAQA review", {
      from, to: "suspicious", disputeId: String(d._id), officer: req.user.email,
    });
  }
  await cred.save();
}

/** Shared decision core: status/resolution/decidedBy + timeline event + credential effect. */
async function applyDecision(req, d, outcome, resolution) {
  const from = d.status;
  d.status = outcome;
  d.resolution = resolution;
  d.decidedBy = req.user.email;
  d.decidedAt = new Date();
  pushEvent(d, req, "dispute.decided", resolution, {
    from, to: outcome, result: outcome, evidence: resolution, officer: req.user.email,
  });
  await applyCredentialEffect(req, d, outcome);
  await d.save();
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
    const cred = await CredentialIndex.findOne({ credentialHash });
    if (!cred) return res.status(404).json({ error: "Credential not found" });
    // Prevent duplicate cases for the same issue (§30.1) — any still-live case counts.
    if (await Dispute.findOne({ credentialHash, category, status: { $in: [...ACTIVE_STATUSES, "appealed"] } })) {
      return res.status(409).json({ error: "A dispute for this issue is already open." });
    }
    const leadAuthority = await leadAuthorityFor(category, cred);
    const dispute = await Dispute.create({
      credentialHash, category, description,
      openedByEmail: req.user.email, openedByRole: req.user.role,
      leadAuthority,
      targetIssuer: leadAuthority === "issuer" ? cred.issuer : undefined,
      institution: cred.institution, subjectName: cred.subjectName,
      events: [makeEvent(req, "dispute.opened", description)],
    });
    // Mark the credential itself as contested so verifications surface UNDER_DISPUTE (§11).
    if (cred.zaqaValidation !== "under_dispute") {
      pushEvent(cred, req, "credential.dispute_opened", description, {
        from: cred.zaqaValidation, to: "under_dispute", disputeId: String(dispute._id), category,
      });
      cred.zaqaValidation = "under_dispute";
      await cred.save();
    }
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

// PATCH /api/disputes/:id/status — the lead authority moves the case through review.
// Allowed transitions: open → under_review; under_review ⇄ awaiting_evidence.
const statusSchema = Joi.object({
  status: Joi.string().valid("under_review", "awaiting_evidence").required(),
  note: Joi.string().max(1000).allow("").optional(),
});
router.patch("/:id/status", requireAuth, requireRole(...GOVERNANCE_ROLES, ROLES.ISSUER), validate(statusSchema), async (req, res, next) => {
  try {
    const d = await Dispute.findById(req.params.id);
    if (!d) return res.status(404).json({ error: "Dispute not found" });
    if (!ownsDispute(req, d)) return res.status(403).json({ error: "This dispute is owned by another authority." });
    const from = d.status, to = req.body.status;
    const allowed =
      (from === "open" && to === "under_review") ||
      (from === "under_review" && to === "awaiting_evidence") ||
      (from === "awaiting_evidence" && to === "under_review");
    if (!allowed) return res.status(409).json({ error: "invalid_transition", from, to });
    d.status = to;
    pushEvent(d, req, "dispute.status_changed", req.body.note || undefined, { from, to });
    await d.save();
    await logActivity(req, { action: "dispute.status_change", entity: "dispute", entityId: String(d._id), summary: `Moved ${d.category.replace(/_/g, " ")} dispute on ${d.subjectName} to ${to.replace(/_/g, " ")}` });
    await notifyEmail(d.openedByEmail, `Your dispute on ${d.subjectName}'s credential is now ${to.replace(/_/g, " ")}.${req.body.note ? ` Note: ${req.body.note}` : ""}`);
    res.json({ dispute: view(d) });
  } catch (err) { next(err); }
});

// POST /api/disputes/:id/decide — the lead authority decides the case (upheld | dismissed).
// An upheld complaint flags the credential for ZAQA review; a dismissed one restores it.
const decideSchema = Joi.object({
  outcome: Joi.string().valid("upheld", "dismissed").required(),
  resolution: Joi.string().min(3).max(1000).required(),
});
router.post("/:id/decide", requireAuth, requireRole(...GOVERNANCE_ROLES, ROLES.ISSUER), validate(decideSchema), async (req, res, next) => {
  try {
    const d = await Dispute.findById(req.params.id);
    if (!d) return res.status(404).json({ error: "Dispute not found" });
    if (!ownsDispute(req, d)) return res.status(403).json({ error: "This dispute is owned by another authority." });
    const { outcome, resolution } = req.body;
    if (!ACTIVE_STATUSES.includes(d.status)) {
      return res.status(409).json({ error: "invalid_transition", from: d.status, to: outcome });
    }
    await applyDecision(req, d, outcome, resolution);
    await logActivity(req, { action: `dispute.${outcome}`, entity: "dispute", entityId: String(d._id), summary: `${outcome === "upheld" ? "Upheld" : "Dismissed"} ${d.category.replace(/_/g, " ")} dispute on ${d.subjectName}` });
    await notifyEmail(
      d.openedByEmail,
      outcome === "upheld"
        ? `Your dispute on ${d.subjectName}'s credential was upheld — the credential has been flagged for ZAQA review. Decision: ${resolution}`
        : `Your dispute on ${d.subjectName}'s credential was dismissed. Decision: ${resolution}`
    );
    res.json({ dispute: view(d) });
  } catch (err) { next(err); }
});

// PATCH /api/disputes/:id/resolve — legacy close endpoint, kept for backward compatibility.
// Internally goes through the same decision core as /:id/decide, recording a dismissal.
const resolveSchema = Joi.object({ resolution: Joi.string().min(3).max(1000).required() });
router.patch("/:id/resolve", requireAuth, requireRole(...GOVERNANCE_ROLES, ROLES.ISSUER), validate(resolveSchema), async (req, res, next) => {
  try {
    const d = await Dispute.findById(req.params.id);
    if (!d) return res.status(404).json({ error: "Dispute not found" });
    if (!ownsDispute(req, d)) return res.status(403).json({ error: "This dispute is owned by another authority." });
    if (d.status === "resolved") return res.status(400).json({ error: "Already resolved." });
    if (!ACTIVE_STATUSES.includes(d.status)) {
      return res.status(409).json({ error: "invalid_transition", from: d.status, to: "dismissed" });
    }
    await applyDecision(req, d, "dismissed", req.body.resolution);
    await logActivity(req, { action: "dispute.resolve", entity: "dispute", entityId: String(d._id), summary: `Resolved ${d.category.replace(/_/g, " ")} dispute on ${d.subjectName}` });
    await notifyEmail(d.openedByEmail, `Your dispute on ${d.subjectName}'s credential has been resolved: ${req.body.resolution}`);
    res.json({ dispute: view(d) });
  } catch (err) { next(err); }
});

// POST /api/disputes/:id/appeal — the original opener appeals an upheld/dismissed decision
// ("resolved" legacy closures may also be appealed). One appeal per case.
const appealSchema = Joi.object({ reason: Joi.string().min(3).max(1000).required() });
router.post("/:id/appeal", requireAuth, validate(appealSchema), async (req, res, next) => {
  try {
    const d = await Dispute.findById(req.params.id);
    if (!d) return res.status(404).json({ error: "Dispute not found" });
    if (d.openedByEmail !== (req.user.email || "").toLowerCase()) {
      return res.status(403).json({ error: "Only the user who opened the dispute can appeal." });
    }
    if (!["upheld", "dismissed", "resolved"].includes(d.status)) {
      return res.status(409).json({ error: "invalid_transition", from: d.status, to: "appealed" });
    }
    if (d.appeal?.openedAt) return res.status(409).json({ error: "An appeal has already been opened for this dispute." });
    const from = d.status;
    d.status = "appealed";
    d.appeal = { reason: req.body.reason, openedAt: new Date(), openedBy: req.user.email };
    pushEvent(d, req, "dispute.appealed", req.body.reason, { from, to: "appealed" });
    await d.save();
    await logActivity(req, { action: "dispute.appeal", entity: "dispute", entityId: String(d._id), summary: `Appealed the decision on the ${d.category.replace(/_/g, " ")} dispute on ${d.subjectName}` });
    // Appeals escalate to ZAQA (top of the governance stack) regardless of the lead authority.
    await notifyRole("zaqa", `Appeal lodged on the ${d.category.replace(/_/g, " ")} dispute on ${d.subjectName}'s credential (${d.institution}).`);
    await notifyEmail(d.openedByEmail, `Your appeal on ${d.subjectName}'s credential dispute has been received and escalated to ZAQA.`);
    res.json({ dispute: view(d) });
  } catch (err) { next(err); }
});

// POST /api/disputes/:id/appeal/decide — ZAQA decides the appeal (appeals always escalate to
// ZAQA regardless of the original lead authority).
const appealDecideSchema = Joi.object({
  outcome: Joi.string().valid("appeal_upheld", "appeal_dismissed").required(),
  resolution: Joi.string().min(3).max(1000).required(),
});
router.post("/:id/appeal/decide", requireAuth, requireRole(ROLES.ZAQA, ROLES.ADMIN), validate(appealDecideSchema), async (req, res, next) => {
  try {
    const d = await Dispute.findById(req.params.id);
    if (!d) return res.status(404).json({ error: "Dispute not found" });
    const { outcome, resolution } = req.body;
    if (d.status !== "appealed") {
      return res.status(409).json({ error: "invalid_transition", from: d.status, to: outcome });
    }
    // Upholding the appeal overturns the original decision — reverse its credential-side effect.
    if (outcome === "appeal_upheld") await reverseCredentialEffect(req, d);
    d.status = outcome;
    d.appeal.decidedBy = req.user.email;
    d.appeal.decidedAt = new Date();
    d.appeal.resolution = resolution;
    let policyVersion;
    try { policyVersion = (await NQFVersion.findOne({ status: "active" }).select("code").lean())?.code; } catch { /* optional */ }
    pushEvent(d, req, "dispute.appeal_decided", resolution, {
      from: "appealed", to: outcome, result: outcome, officer: req.user.email,
      ...(policyVersion ? { policyVersion } : {}),
    });
    await d.save();
    await logActivity(req, { action: `dispute.${outcome}`, entity: "dispute", entityId: String(d._id), summary: `${outcome === "appeal_upheld" ? "Upheld" : "Dismissed"} the appeal on the ${d.category.replace(/_/g, " ")} dispute on ${d.subjectName}` });
    await notifyEmail(
      d.openedByEmail,
      outcome === "appeal_upheld"
        ? `Your appeal on ${d.subjectName}'s credential dispute was upheld — the original decision has been overturned. ${resolution}`
        : `Your appeal on ${d.subjectName}'s credential dispute was dismissed — the original decision stands. ${resolution}`
    );
    res.json({ dispute: view(d) });
  } catch (err) { next(err); }
});

export default router;
