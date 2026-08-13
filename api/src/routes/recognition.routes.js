// Recognition module (RPL / CATS / progression / foreign qualifications / micro-credentials).
// A learner opens a recognition case against the NQF, uploads evidence, and the lead authority
// (TEVETA for RPL, ZAQA for everything else) screens, assesses and decides the case with an
// explainable NQF level-descriptor analysis. The full case timeline is preserved — history is
// appended, never rewritten — and every decision records the framework version it was made under.
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES, GOVERNANCE_ROLES } from "../middleware/auth.js";
import { RecognitionCase, RegisteredQualification } from "../models/index.js";
import { nextNumber } from "../models/billing.models.js";
import { versionEffectiveOn } from "../services/nqf.service.js";
import { pin } from "../services/ipfs.service.js";
import { pushEvent } from "../services/history.service.js";
import { logActivity } from "../services/activity.service.js";
import { notifyEmail } from "../services/notify.service.js";

const router = Router();

// Case type → caseRef prefix (sequential, year-scoped: RPL-2026-0001, …).
const CASE_PREFIX = {
  rpl: "RPL",
  credit_transfer: "CAT",
  progression: "PRG",
  foreign_qualification: "FQE",
  micro_credential: "MCR",
};
// Case type → lead authority: RPL is a TEVETA process; CATS, progression, foreign
// qualification evaluation and micro-credential recognition are national (ZAQA) processes.
const LEAD_AUTHORITY = { rpl: "teveta" };
const leadAuthorityFor = (type) => LEAD_AUTHORITY[type] || "zaqa";

// Plain-language labels for applicant-facing notifications.
const TYPE_LABEL = {
  rpl: "Recognition of Prior Learning",
  credit_transfer: "credit transfer",
  progression: "progression route",
  foreign_qualification: "foreign qualification evaluation",
  micro_credential: "micro-credential recognition",
};
const STATUS_LABEL = {
  screening: "is being screened for completeness",
  assessment: "is now under assessment",
  decision_pending: "has completed assessment and is awaiting a decision",
};
const OUTCOME_LABEL = {
  recognised: "recognised",
  partially_recognised: "partially recognised",
  not_recognised: "not recognised",
};

const TERMINAL_STATUSES = ["recognised", "partially_recognised", "not_recognised", "withdrawn"];

// Evidence upload item (base64 document, pinned to IPFS — router is mounted with an 8 MB
// JSON limit, like /api/applications, which bounds the total upload size).
const evidenceItemSchema = Joi.object({
  base64: Joi.string().base64().max(8_000_000).required(),
  name: Joi.string().max(200).required(),
  mime: Joi.string().max(100).required(),
  description: Joi.string().max(300).allow("").optional(),
});
const evidenceArraySchema = Joi.array().items(evidenceItemSchema).max(5);

/** Pin each uploaded evidence document to IPFS and return schema-shaped entries. */
async function pinEvidence(items, actorEmail) {
  const pinned = [];
  for (const e of items || []) {
    const cid = await pin({ filename: e.name, mime: e.mime, data: e.base64 });
    pinned.push({ cid, name: e.name, mime: e.mime, description: e.description || undefined, addedAt: new Date(), addedBy: actorEmail });
  }
  return pinned;
}

/** May this user act as the case's lead authority? (admin has oversight of every queue) */
const isLeadAuthority = (req, c) => req.user.role === "admin" || req.user.role === c.leadAuthority;
/** Is this the applicant's own case? */
const isApplicant = (req, c) => c.applicantEmail === req.user.email?.toLowerCase();

// POST /api/recognition (holder) — open a recognition case + upload evidence.
const openSchema = Joi.object({
  type: Joi.string().valid(...Object.keys(CASE_PREFIX)).required(),
  targetQualificationRef: Joi.string().max(60).optional(),
  targetTitle: Joi.string().max(200).optional(),
  targetNqfLevel: Joi.number().integer().min(1).max(10).optional(),
  sourceDescription: Joi.string().min(10).max(3000).required(),
  sourceCountry: Joi.string().max(80).when("type", {
    is: "foreign_qualification",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  sourceInstitution: Joi.string().max(200).optional(),
  evidence: evidenceArraySchema.optional(),
});
router.post("/", requireAuth, requireRole(ROLES.HOLDER), validate(openSchema), async (req, res, next) => {
  try {
    // Resolve the target against the national register when a reference is given (latest version).
    let targetQualification;
    if (req.body.targetQualificationRef) {
      targetQualification = await RegisteredQualification.findOne({ referenceId: req.body.targetQualificationRef })
        .sort({ qualificationVersion: -1 })
        .lean();
      if (!targetQualification) return res.status(404).json({ error: "Target qualification not found in the national register" });
    }

    const evidence = await pinEvidence(req.body.evidence, req.user.email);
    const leadAuthority = leadAuthorityFor(req.body.type);
    const caseRef = await nextNumber(CASE_PREFIX[req.body.type]);

    const c = new RecognitionCase({
      caseRef,
      type: req.body.type,
      applicantEmail: req.user.email,
      applicantName: req.user.name,
      targetQualification: targetQualification?._id,
      targetQualificationRef: targetQualification?.referenceId || req.body.targetQualificationRef,
      targetTitle: req.body.targetTitle || targetQualification?.title,
      targetNqfLevel: req.body.targetNqfLevel ?? targetQualification?.nqfLevel,
      sourceDescription: req.body.sourceDescription,
      sourceCountry: req.body.sourceCountry,
      sourceInstitution: req.body.sourceInstitution,
      evidence,
      leadAuthority,
    });
    pushEvent(c, req, "recognition.submitted", `${TYPE_LABEL[c.type]} case opened`, { leadAuthority, evidenceCount: evidence.length });
    await c.save();

    await logActivity(req, { action: "recognition.submit", entity: "recognition", entityId: String(c._id), summary: `Opened ${TYPE_LABEL[c.type]} case ${c.caseRef}` });
    await notifyEmail(c.applicantEmail, `Your ${TYPE_LABEL[c.type]} application has been received. Your case reference is ${c.caseRef} — you can follow its progress under “My recognition cases”.`);
    res.status(201).json({ case: c });
  } catch (err) { next(err); }
});

// GET /api/recognition/mine (holder) — my cases, full timeline included.
router.get("/mine", requireAuth, requireRole(ROLES.HOLDER), async (req, res, next) => {
  try {
    const rows = await RecognitionCase.find({ applicantEmail: req.user.email?.toLowerCase() }).sort({ createdAt: -1 }).lean();
    res.json({ cases: rows });
  } catch (err) { next(err); }
});

// GET /api/recognition/queue (governance) — the queue for MY authority; admin sees all.
// Optional ?status= and ?type= filters.
router.get("/queue", requireAuth, requireRole(...GOVERNANCE_ROLES), async (req, res, next) => {
  try {
    const q = req.user.role === "admin" ? {} : { leadAuthority: req.user.role };
    if (req.query.status) {
      if (!RecognitionCase.schema.path("status").enumValues.includes(req.query.status)) {
        return res.status(400).json({ error: "Unknown status filter" });
      }
      q.status = req.query.status;
    }
    if (req.query.type) {
      if (!CASE_PREFIX[req.query.type]) return res.status(400).json({ error: "Unknown type filter" });
      q.type = req.query.type;
    }
    const rows = await RecognitionCase.find(q).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ cases: rows });
  } catch (err) { next(err); }
});

// PATCH /api/recognition/:id/status (lead authority) — move the case through the workflow.
// submitted → screening → assessment → decision_pending, with assessment → screening as the
// send-back path. Decisions themselves go through POST /:id/decide.
const TRANSITIONS = {
  submitted: ["screening"],
  screening: ["assessment"],
  assessment: ["decision_pending", "screening"],
};
const statusSchema = Joi.object({
  status: Joi.string().valid("screening", "assessment", "decision_pending").required(),
  note: Joi.string().max(500).allow("").optional(),
});
router.patch("/:id/status", requireAuth, requireRole(...GOVERNANCE_ROLES), validate(statusSchema), async (req, res, next) => {
  try {
    const c = await RecognitionCase.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Case not found" });
    if (!isLeadAuthority(req, c)) return res.status(403).json({ error: "This case is owned by another authority." });
    const from = c.status;
    const to = req.body.status;
    if (!(TRANSITIONS[from] || []).includes(to)) {
      return res.status(409).json({ error: "invalid_transition", from, to });
    }
    c.status = to;
    pushEvent(c, req, "recognition.status_changed", req.body.note || undefined, { from, to });
    await c.save();
    await logActivity(req, { action: "recognition.status_change", entity: "recognition", entityId: String(c._id), summary: `Moved case ${c.caseRef} from ${from} to ${to}` });
    await notifyEmail(c.applicantEmail, `Your ${TYPE_LABEL[c.type]} case ${c.caseRef} ${STATUS_LABEL[to]}${req.body.note ? `: ${req.body.note}` : "."}`);
    res.json({ case: c });
  } catch (err) { next(err); }
});

// POST /api/recognition/:id/evidence (holder) — add evidence to my open case.
const addEvidenceSchema = Joi.object({ evidence: evidenceArraySchema.min(1).required() });
router.post("/:id/evidence", requireAuth, requireRole(ROLES.HOLDER), validate(addEvidenceSchema), async (req, res, next) => {
  try {
    const c = await RecognitionCase.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Case not found" });
    if (!isApplicant(req, c)) return res.status(403).json({ error: "Not your case." });
    if (TERMINAL_STATUSES.includes(c.status)) return res.status(400).json({ error: `This case is closed (${c.status}) — no more evidence can be added.` });
    const pinned = await pinEvidence(req.body.evidence, req.user.email);
    c.evidence.push(...pinned);
    pushEvent(c, req, "recognition.evidence_added", `${pinned.length} evidence document(s) added`, { count: pinned.length, names: pinned.map((e) => e.name) });
    await c.save();
    await logActivity(req, { action: "recognition.evidence_add", entity: "recognition", entityId: String(c._id), summary: `Added ${pinned.length} evidence document(s) to case ${c.caseRef}` });
    res.json({ case: c });
  } catch (err) { next(err); }
});

// POST /api/recognition/:id/decide (lead authority) — the explainable recognition decision.
// Records the outcome, the level-descriptor analysis (knowledge / skills / autonomy &
// responsibility), the responsible officer and the NQF framework version applied.
const decideSchema = Joi.object({
  outcome: Joi.string().valid("recognised", "partially_recognised", "not_recognised").required(),
  nqfLevel: Joi.number().integer().min(1).max(10).optional(),
  creditsAwarded: Joi.number().min(0).optional(),
  mappedQualificationRef: Joi.string().max(60).optional(),
  rationale: Joi.string().min(10).max(3000).required(),
  descriptorAnalysis: Joi.object({
    knowledge: Joi.string().max(2000).optional(),
    skills: Joi.string().max(2000).optional(),
    autonomyResponsibility: Joi.string().max(2000).optional(),
  }).optional(),
});
router.post("/:id/decide", requireAuth, requireRole(...GOVERNANCE_ROLES), validate(decideSchema), async (req, res, next) => {
  try {
    const c = await RecognitionCase.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Case not found" });
    if (!isLeadAuthority(req, c)) return res.status(403).json({ error: "This case is owned by another authority." });
    if (!["assessment", "decision_pending"].includes(c.status)) {
      return res.status(409).json({ error: "invalid_transition", from: c.status, to: req.body.outcome });
    }
    // Decisions are judged under the framework version in force today (spec §3.2).
    const version = await versionEffectiveOn();
    const policyVersion = version?.code;

    const from = c.status;
    c.status = req.body.outcome;
    c.decision = {
      outcome: req.body.outcome,
      nqfLevel: req.body.nqfLevel,
      creditsAwarded: req.body.creditsAwarded,
      mappedQualificationRef: req.body.mappedQualificationRef,
      rationale: req.body.rationale,
      descriptorAnalysis: req.body.descriptorAnalysis,
      officer: req.user.email,
      policyVersion,
      at: new Date(),
    };
    pushEvent(c, req, "recognition.decided", req.body.rationale, {
      from, to: req.body.outcome,
      result: req.body.outcome,
      rule: "NQF level descriptor analysis",
      evidence: req.body.rationale,
      officer: req.user.email,
      policyVersion,
    });
    await c.save();
    await logActivity(req, { action: "recognition.decide", entity: "recognition", entityId: String(c._id), summary: `Decided case ${c.caseRef}: ${OUTCOME_LABEL[req.body.outcome]}` });
    await notifyEmail(c.applicantEmail, `A decision has been made on your ${TYPE_LABEL[c.type]} case ${c.caseRef}: your prior learning was ${OUTCOME_LABEL[req.body.outcome]}${req.body.nqfLevel ? ` at NQF Level ${req.body.nqfLevel}` : ""}${req.body.creditsAwarded != null ? ` with ${req.body.creditsAwarded} credits awarded` : ""}. Reason: ${req.body.rationale}`);
    res.json({ case: c });
  } catch (err) { next(err); }
});

// POST /api/recognition/:id/withdraw (holder) — withdraw my open case.
router.post("/:id/withdraw", requireAuth, requireRole(ROLES.HOLDER), async (req, res, next) => {
  try {
    const c = await RecognitionCase.findById(req.params.id);
    if (!c) return res.status(404).json({ error: "Case not found" });
    if (!isApplicant(req, c)) return res.status(403).json({ error: "Not your case." });
    if (TERMINAL_STATUSES.includes(c.status)) return res.status(400).json({ error: `This case is already closed (${c.status}).` });
    const from = c.status;
    c.status = "withdrawn";
    pushEvent(c, req, "recognition.withdrawn", "Withdrawn by the applicant", { from, to: "withdrawn" });
    await c.save();
    await logActivity(req, { action: "recognition.withdraw", entity: "recognition", entityId: String(c._id), summary: `Withdrew ${TYPE_LABEL[c.type]} case ${c.caseRef}` });
    res.json({ case: c });
  } catch (err) { next(err); }
});

// GET /api/recognition/:id — full case: the applicant, the lead authority, or admin.
// NOTE: registered after the literal /mine and /queue paths above.
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const c = await RecognitionCase.findById(req.params.id).lean();
    if (!c) return res.status(404).json({ error: "Case not found" });
    const allowed = req.user.role === "admin" || req.user.role === c.leadAuthority || c.applicantEmail === req.user.email?.toLowerCase();
    if (!allowed) return res.status(403).json({ error: "Forbidden" });
    res.json({ case: c });
  } catch (err) { next(err); }
});

export default router;
