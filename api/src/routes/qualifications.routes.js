// National qualifications register — read APIs (spec §5, §21.1) plus the Phase-2 registration
// workflow. Registration is a MANUAL, NQF-aware operation (spec §7): an institution proposes a
// qualification (course/programme design) → the appropriate sub-framework authority (HEA for
// higher education, TEVETA for TEVET, ECZ for general education) reviews and recommends → ZAQA
// takes the national registration decision, assigns the reference ID and anchors the
// registration fingerprint. Every step appends an event; nothing is edited in place.
// Public callers see only published register entries; governance roles also see drafts and
// in-flight applications.
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES, GOVERNANCE_ROLES } from "../middleware/auth.js";
import { RegisteredQualification, Issuer, Counter } from "../models/index.js";
import { qualificationFingerprint, versionEffectiveOn } from "../services/nqf.service.js";
import { notifyRole, notifyIssuerOfficers } from "../services/notify.service.js";
import { logActivity } from "../services/activity.service.js";
import { makeEvent, pushEvent } from "../services/history.service.js";

const router = Router();

// Issuer sector → NQF sub-framework, and the authority role that reviews it (spec §4).
const SECTOR_TO_SUBFRAMEWORK = { higher_ed: "higher_ed", tevet: "tevet", secondary: "general" };
const SUBFRAMEWORK_AUTHORITY = { higher_ed: ROLES.HEA, tevet: ROLES.TEVETA, general: ROLES.ECZ };

const PUBLIC_STATUSES = ["registered", "suspended", "expired", "deregistered"];

function view(q, { full = false } = {}) {
  const base = {
    id: q._id,
    referenceId: q.referenceId,
    title: q.title,
    qualificationType: q.qualificationType,
    nqfLevel: q.nqfLevel,
    currentMappedLevel: q.currentMappedLevel,
    frameworkVersion: q.frameworkVersion,
    subFramework: q.subFramework,
    fieldOfEducation: q.fieldOfEducation,
    creditValue: q.creditValue,
    awardingBody: q.awardingBody,
    status: q.status,
    qualificationVersion: q.qualificationVersion,
    registrationDate: q.registrationDate,
    effectiveDate: q.effectiveDate,
    expiryDate: q.expiryDate,
  };
  if (!full) return base;
  return {
    ...base,
    purpose: q.purpose,
    learningOutcomes: q.learningOutcomes,
    assessmentCriteria: q.assessmentCriteria,
    notionalHours: q.notionalHours,
    minEntryRequirements: q.minEntryRequirements,
    progressionRoutes: q.progressionRoutes,
    rplAvailable: q.rplAvailable,
    relatedOccupation: q.relatedOccupation,
    qaAuthority: q.qaAuthority,
    fingerprint: q.fingerprint,
    events: q.events,
    previousVersion: q.previousVersion,
    supersededBy: q.supersededBy,
  };
}

/** Optional auth: attaches req.user when a valid bearer token is present, else continues. */
function optionalAuth(req, _res, next) {
  if (!req.headers.authorization) return next();
  return requireAuth(req, _res, next);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/qualifications?q=&nqfLevel=&qualificationType=&subFramework=&status=&page=&limit= —
// search the national qualifications register. Free text `q` matches title, reference ID, field
// of education or awarding body (case-insensitive). Arbitrary `status` is governance-only; the
// public always stays within PUBLIC_STATUSES. When `q` or `page` is present the response is the
// paginated register shape { items, total, page, pages }; otherwise the legacy
// { qualifications: [...] } shape is preserved for existing portal pages.
router.get("/", optionalAuth, async (req, res, next) => {
  try {
    const isGovernance = req.user && GOVERNANCE_ROLES.includes(req.user.role);
    const filter = {};
    filter.status = isGovernance && req.query.status
      ? req.query.status
      : { $in: req.query.status && PUBLIC_STATUSES.includes(req.query.status) ? [req.query.status] : PUBLIC_STATUSES };
    if (!isGovernance || !req.query.status) filter.supersededBy = null; // latest versions only
    if (req.query.q) {
      const rx = { $regex: escapeRegex(String(req.query.q).slice(0, 80)), $options: "i" };
      filter.$or = [{ title: rx }, { referenceId: rx }, { fieldOfEducation: rx }, { awardingBody: rx }];
    }
    const nqfLevel = req.query.nqfLevel ?? req.query.level; // `level` kept for legacy callers
    if (nqfLevel) filter.nqfLevel = parseInt(nqfLevel, 10);
    if (req.query.qualificationType) filter.qualificationType = req.query.qualificationType;
    if (req.query.subFramework) filter.subFramework = req.query.subFramework;

    if (req.query.page !== undefined || req.query.q !== undefined) {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const [total, rows] = await Promise.all([
        RegisteredQualification.countDocuments(filter),
        RegisteredQualification.find(filter).sort({ title: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      ]);
      return res.json({
        items: rows.map((q) => view(q)),
        total,
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
      });
    }

    const rows = await RegisteredQualification.find(filter).sort({ title: 1 }).limit(200).lean();
    res.json({ qualifications: rows.map((q) => view(q)) });
  } catch (err) { next(err); }
});

// GET /api/qualifications/:referenceId — full register entry (latest version) + version history.
router.get("/:referenceId", optionalAuth, async (req, res, next) => {
  try {
    const isGovernance = req.user && GOVERNANCE_ROLES.includes(req.user.role);
    const statusFilter = isGovernance ? {} : { status: { $in: PUBLIC_STATUSES } };
    const q = await RegisteredQualification.findOne({ referenceId: req.params.referenceId, ...statusFilter })
      .sort({ qualificationVersion: -1 })
      .lean();
    if (!q) return res.status(404).json({ error: "Qualification not found in the national register" });

    const history = await RegisteredQualification.find({ referenceId: q.referenceId })
      .sort({ qualificationVersion: -1 })
      .select("qualificationVersion status fingerprint registrationDate effectiveDate expiryDate createdAt")
      .lean();

    res.json({ qualification: view(q, { full: true }), versions: history });
  } catch (err) { next(err); }
});

// GET /api/qualifications/:referenceId/history (public) — the full amendment/version chain of a
// register entry: every version (walked through previousVersion/supersededBy links, so versions
// that carried a different reference ID are included too) with its status, registration dates and
// complete events[] timeline. History of a public qualification is public: non-governance callers
// see only versions whose status is public or "superseded".
router.get("/:referenceId/history", optionalAuth, async (req, res, next) => {
  try {
    const isGovernance = req.user && GOVERNANCE_ROLES.includes(req.user.role);
    const start = await RegisteredQualification.findOne({ referenceId: req.params.referenceId })
      .sort({ qualificationVersion: -1 })
      .lean();
    if (!start) return res.status(404).json({ error: "Qualification not found in the national register" });

    // Walk the version chain in both directions (bounded; guards against link cycles).
    const chain = new Map([[String(start._id), start]]);
    for (const link of ["supersededBy", "previousVersion"]) {
      let cur = start;
      for (let hops = 0; cur?.[link] && hops < 50; hops++) {
        const doc = await RegisteredQualification.findById(cur[link]).lean();
        if (!doc || chain.has(String(doc._id))) break;
        chain.set(String(doc._id), doc);
        cur = doc;
      }
    }

    let versions = [...chain.values()].sort(
      (a, b) => (b.qualificationVersion || 1) - (a.qualificationVersion || 1)
    );
    if (!isGovernance) {
      const visible = [...PUBLIC_STATUSES, "superseded"];
      versions = versions.filter((v) => visible.includes(v.status));
    }
    if (!versions.length) {
      return res.status(404).json({ error: "Qualification not found in the national register" });
    }

    res.json({
      referenceId: req.params.referenceId,
      versions: versions.map((v) => ({
        id: v._id,
        referenceId: v.referenceId,
        qualificationVersion: v.qualificationVersion || 1,
        title: v.title,
        nqfLevel: v.nqfLevel,
        frameworkVersion: v.frameworkVersion,
        status: v.status,
        registrationDate: v.registrationDate,
        effectiveDate: v.effectiveDate,
        expiryDate: v.expiryDate,
        renewalDate: v.renewalDate,
        previousVersion: v.previousVersion || null,
        supersededBy: v.supersededBy || null,
        fingerprint: v.fingerprint,
        events: v.events || [],
      })),
    });
  } catch (err) { next(err); }
});

// ---- Phase-2 registration workflow (manual, authority-approved) -------------

function event(actor, action, note) {
  return { at: new Date(), actor, action, note };
}

/** Sub-framework(s) an authority seat reviews (admin sees all). */
function authorityScope(role) {
  if (role === ROLES.ADMIN || role === ROLES.ZAQA) return ["higher_ed", "tevet", "general"];
  return Object.entries(SUBFRAMEWORK_AUTHORITY)
    .filter(([, r]) => r === role)
    .map(([sf]) => sf);
}

// POST /api/qualifications/propose (institution) — submit a qualification design for
// registration. The sub-framework and awarding body come from the institution's own record;
// the NQF level here is the PROPOSED level, confirmed or corrected by the authority + ZAQA.
const proposeSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  qualificationType: Joi.string().valid("full", "part", "micro_credential").default("full"),
  nqfLevel: Joi.number().integer().min(1).max(10).required(),
  fieldOfEducation: Joi.string().max(160).allow("").optional(),
  purpose: Joi.string().max(2000).allow("").optional(),
  learningOutcomes: Joi.array().items(Joi.string().max(400)).max(40).default([]),
  assessmentCriteria: Joi.array().items(Joi.string().max(400)).max(40).default([]),
  creditValue: Joi.number().integer().min(1).max(2000).optional(),
  notionalHours: Joi.number().integer().min(1).max(20000).optional(),
  minEntryRequirements: Joi.array().items(Joi.string().max(300)).max(20).default([]),
  progressionRoutes: Joi.array().items(Joi.string().max(300)).max(20).default([]),
  rplAvailable: Joi.boolean().default(false),
});
router.post("/propose", requireAuth, requireRole(ROLES.ISSUER), validate(proposeSchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.user.issuerId);
    if (!issuer) return res.status(403).json({ error: "Issuer profile not found" });
    if ((issuer.heaStatus || "approved") !== "approved") {
      return res.status(403).json({ error: "Your institution must be approved by its regulator before proposing qualifications." });
    }
    const subFramework = SECTOR_TO_SUBFRAMEWORK[issuer.sector] || "higher_ed";
    const fw = await versionEffectiveOn(new Date());
    if (!fw) return res.status(503).json({ error: "No NQF framework version is configured — contact ZAQA." });

    const q = await RegisteredQualification.create({
      ...req.body,
      frameworkVersion: fw.code,
      subFramework,
      awardingBody: issuer.institution,
      awardingBodyIssuer: issuer._id,
      approvedProviders: [issuer._id],
      status: "submitted",
      events: [event(req.user.email, "submitted", `Proposed by ${issuer.institution}`)],
    });
    const authority = SUBFRAMEWORK_AUTHORITY[subFramework];
    await notifyRole(authority, `New qualification proposal "${q.title}" (NQF ${q.nqfLevel}) from ${issuer.institution} awaits your review.`);
    await logActivity(req, { action: "qualification.propose", entity: "qualification", entityId: String(q._id), summary: `Proposed qualification "${q.title}" (NQF ${q.nqfLevel})` });
    res.status(201).json({ qualification: view(q, { full: true }) });
  } catch (err) { next(err); }
});

// GET /api/qualifications/workflow/mine (institution) — my proposals + registrations.
router.get("/workflow/mine", requireAuth, requireRole(ROLES.ISSUER), async (req, res, next) => {
  try {
    const rows = await RegisteredQualification.find({ awardingBodyIssuer: req.user.issuerId })
      .sort({ createdAt: -1 }).lean();
    res.json({ qualifications: rows.map((q) => ({ ...view(q), events: q.events })) });
  } catch (err) { next(err); }
});

// GET /api/qualifications/workflow/inbox (authority/ZAQA) — proposals in my sub-framework(s).
// Authorities see submitted/under_review; ZAQA additionally acts on recommended ones.
router.get("/workflow/inbox", requireAuth, requireRole(...GOVERNANCE_ROLES), async (req, res, next) => {
  try {
    const rows = await RegisteredQualification.find({
      status: { $in: ["submitted", "under_review"] },
      subFramework: { $in: authorityScope(req.user.role) },
    }).sort({ createdAt: 1 }).lean();
    res.json({ qualifications: rows.map((q) => ({ ...view(q, { full: true }) })) });
  } catch (err) { next(err); }
});

/** Load a workflow item and check the actor's sub-framework scope. */
async function scopedQualification(req, res) {
  const q = await RegisteredQualification.findById(req.params.id);
  if (!q) { res.status(404).json({ error: "Qualification not found" }); return null; }
  if (!authorityScope(req.user.role).includes(q.subFramework)) {
    res.status(403).json({ error: "This qualification belongs to another authority's sub-framework." });
    return null;
  }
  return q;
}

const AUTHORITY_ROLES = [ROLES.HEA, ROLES.TEVETA, ROLES.ECZ, ROLES.ADMIN];
const noteSchema = Joi.object({ note: Joi.string().max(500).allow("").optional() });

// POST /api/qualifications/:id/recommend (appropriate authority) — endorse to ZAQA.
router.post("/:id/recommend", requireAuth, requireRole(...AUTHORITY_ROLES), validate(noteSchema), async (req, res, next) => {
  try {
    const q = await scopedQualification(req, res);
    if (!q) return;
    if (!["submitted", "under_review"].includes(q.status)) {
      return res.status(400).json({ error: `Cannot recommend a ${q.status} qualification.` });
    }
    q.status = "under_review";
    q.events.push(event(req.user.email, "recommended", req.body.note || "Recommended to ZAQA for national registration"));
    await q.save();
    await notifyRole("zaqa", `Qualification "${q.title}" was recommended by the ${q.subFramework} authority — ZAQA registration decision required.`);
    await logActivity(req, { action: "qualification.recommend", entity: "qualification", entityId: String(q._id), summary: `Recommended "${q.title}" to ZAQA` });
    res.json({ qualification: view(q, { full: true }) });
  } catch (err) { next(err); }
});

// POST /api/qualifications/:id/reject (authority or ZAQA) — reject with a reason.
const rejectSchema = Joi.object({ reason: Joi.string().min(3).max(500).required() });
router.post("/:id/reject", requireAuth, requireRole(...AUTHORITY_ROLES, ROLES.ZAQA), validate(rejectSchema), async (req, res, next) => {
  try {
    const q = await scopedQualification(req, res);
    if (!q) return;
    if (!["submitted", "under_review"].includes(q.status)) {
      return res.status(400).json({ error: `Cannot reject a ${q.status} qualification.` });
    }
    q.status = "rejected";
    q.events.push(event(req.user.email, "rejected", req.body.reason));
    await q.save();
    if (q.awardingBodyIssuer) await notifyIssuerOfficers(q.awardingBodyIssuer, `Qualification proposal "${q.title}" was rejected: ${req.body.reason}`);
    await logActivity(req, { action: "qualification.reject", entity: "qualification", entityId: String(q._id), summary: `Rejected "${q.title}"` });
    res.json({ qualification: view(q, { full: true }) });
  } catch (err) { next(err); }
});

// POST /api/qualifications/:id/register (ZAQA) — the national registration decision.
// Assigns the national reference ID and validity period, fixes the NQF level, and computes the
// registration fingerprint (anchored on-chain by the QualificationRegistry contract, Phase 3).
const registerSchema = Joi.object({
  nqfLevel: Joi.number().integer().min(1).max(10).optional(), // ZAQA may correct the proposed level
  validityYears: Joi.number().integer().min(1).max(10).default(5),
  note: Joi.string().max(500).allow("").optional(),
});
router.post("/:id/register", requireAuth, requireRole(ROLES.ZAQA, ROLES.ADMIN), validate(registerSchema), async (req, res, next) => {
  try {
    const q = await RegisteredQualification.findById(req.params.id);
    if (!q) return res.status(404).json({ error: "Qualification not found" });
    if (q.status !== "under_review") {
      return res.status(400).json({ error: "ZAQA registers a qualification only after the appropriate authority has recommended it." });
    }
    const year = new Date().getFullYear();
    const c = await Counter.findOneAndUpdate(
      { key: `zaqa-q-${year}` }, { $inc: { seq: 1 } }, { new: true, upsert: true }
    );
    q.referenceId = `ZAQA-Q-${year}-${String(c.seq).padStart(4, "0")}`;
    if (req.body.nqfLevel) q.nqfLevel = req.body.nqfLevel;
    q.registrationDate = new Date();
    q.effectiveDate = new Date();
    q.expiryDate = new Date(Date.now() + req.body.validityYears * 365.25 * 24 * 3600 * 1000);
    q.status = "registered";
    q.fingerprint = qualificationFingerprint(q);
    q.events.push(event(req.user.email, "registered", req.body.note || `Registered as ${q.referenceId}, NQF Level ${q.nqfLevel}`));
    await q.save();
    if (q.awardingBodyIssuer) {
      await notifyIssuerOfficers(q.awardingBodyIssuer, `"${q.title}" is now nationally registered (${q.referenceId}, NQF Level ${q.nqfLevel}).`);
      await Issuer.updateOne({ _id: q.awardingBodyIssuer }, { $addToSet: { accreditedPrograms: q.title } });
    }
    await logActivity(req, { action: "qualification.register", entity: "qualification", entityId: q.referenceId, summary: `Registered "${q.title}" as ${q.referenceId} (NQF ${q.nqfLevel})` });
    res.json({ qualification: view(q, { full: true }) });
  } catch (err) { next(err); }
});

// POST /api/qualifications/:id/amend (ZAQA) — amend a registered qualification. Amendments never
// edit in place (spec §7): a NEW register document is created (version+1) with the changes
// applied and a recomputed fingerprint; the old version is marked superseded and both are linked
// through previousVersion/supersededBy. The reference ID is shared across versions — the unique
// index is (referenceId, qualificationVersion) — so the national ID never changes on amendment.
const amendSchema = Joi.object({
  changes: Joi.object({
    title: Joi.string().min(3).max(200),
    learningOutcomes: Joi.array().items(Joi.string().max(400)).max(40),
    assessmentCriteria: Joi.array().items(Joi.string().max(400)).max(40),
    creditValue: Joi.number().integer().min(1).max(2000),
    notionalHours: Joi.number().integer().min(1).max(20000),
    minEntryRequirements: Joi.array().items(Joi.string().max(300)).max(20),
    progressionRoutes: Joi.array().items(Joi.string().max(300)).max(20),
    fieldOfEducation: Joi.string().max(160).allow(""),
    purpose: Joi.string().max(2000).allow(""),
  }).min(1).required(),
  note: Joi.string().min(3).max(500).required(),
});
router.post("/:id/amend", requireAuth, requireRole(ROLES.ZAQA, ROLES.ADMIN), validate(amendSchema), async (req, res, next) => {
  try {
    const old = await RegisteredQualification.findById(req.params.id);
    if (!old) return res.status(404).json({ error: "Qualification not found" });
    if (old.status !== "registered" || old.supersededBy) {
      return res.status(409).json({ error: "invalid_transition", detail: `Only the current registered version can be amended (status: ${old.status}).` });
    }

    const changes = req.body.changes;
    const changedFields = Object.keys(changes);
    const oldVersion = old.qualificationVersion || 1;

    const src = old.toObject();
    for (const f of ["_id", "__v", "createdAt", "updatedAt", "events", "supersededBy", "fingerprint", "fingerprintAnchorTx"]) {
      delete src[f];
    }
    const draft = {
      ...src,
      ...changes,
      qualificationVersion: oldVersion + 1,
      previousVersion: old._id,
      status: "registered",
      events: [
        makeEvent(
          req,
          "qualification.amended",
          `${req.body.note} (amended from ${old.referenceId} v${oldVersion}; fields: ${changedFields.join(", ")}; framework ${old.frameworkVersion})`,
          { from: { referenceId: old.referenceId, version: oldVersion }, changes: changedFields, officer: req.user.email, policyVersion: old.frameworkVersion }
        ),
      ],
    };
    // Same fingerprint rule as /register: recompute over the regulated fields of the new version.
    draft.fingerprint = qualificationFingerprint(draft);
    const amended = await RegisteredQualification.create(draft);

    // Supersede the old version. "superseded" is intentionally outside the status enum used by
    // the workflow routes, so it is written with an update (update validators are off) — the
    // register/history filters treat it as a public, read-only historical state.
    await RegisteredQualification.updateOne(
      { _id: old._id },
      {
        $set: { status: "superseded", supersededBy: amended._id },
        $push: { events: makeEvent(req, "qualification.superseded", `Superseded by version ${amended.qualificationVersion}: ${req.body.note}`, { to: "superseded", officer: req.user.email }) },
      }
    );

    if (old.awardingBodyIssuer && changes.title && changes.title !== old.title) {
      await Issuer.updateOne({ _id: old.awardingBodyIssuer }, { $addToSet: { accreditedPrograms: amended.title } });
    }
    await logActivity(req, { action: "qualification.amend", entity: "qualification", entityId: amended.referenceId || String(amended._id), summary: `Amended "${amended.title}" (${amended.referenceId}) to version ${amended.qualificationVersion}` });
    res.status(201).json({ qualification: view(amended, { full: true }) });
  } catch (err) { next(err); }
});

// POST /api/qualifications/:id/lifecycle (ZAQA) — register-entry lifecycle decisions.
// suspend: registered → suspended; reinstate: suspended → registered;
// deregister (terminal): registered|suspended → deregistered;
// renew: stays registered, stamps renewalDate and extends expiryDate by 5 years.
const LIFECYCLE_TRANSITIONS = {
  suspend: { from: ["registered"], to: "suspended" },
  reinstate: { from: ["suspended"], to: "registered" },
  deregister: { from: ["registered", "suspended"], to: "deregistered" },
  renew: { from: ["registered"], to: "registered" },
};
const lifecycleSchema = Joi.object({
  action: Joi.string().valid("suspend", "reinstate", "deregister", "renew").required(),
  note: Joi.string().min(3).max(500).required(),
});
router.post("/:id/lifecycle", requireAuth, requireRole(ROLES.ZAQA, ROLES.ADMIN), validate(lifecycleSchema), async (req, res, next) => {
  try {
    const q = await RegisteredQualification.findById(req.params.id);
    if (!q) return res.status(404).json({ error: "Qualification not found" });
    const { action, note } = req.body;
    const transition = LIFECYCLE_TRANSITIONS[action];
    if (!transition.from.includes(q.status) || q.supersededBy) {
      return res.status(409).json({ error: "invalid_transition", detail: `Cannot ${action} a ${q.status} qualification.` });
    }
    const from = q.status;
    q.status = transition.to;
    if (action === "renew") {
      q.renewalDate = new Date();
      const base = q.expiryDate ? q.expiryDate.getTime() : Date.now();
      q.expiryDate = new Date(base + 5 * 365.25 * 24 * 3600 * 1000);
    }
    pushEvent(q, req, `qualification.${action}`, note, { from, to: transition.to, officer: req.user.email });
    await q.save();
    if (q.awardingBodyIssuer) {
      await notifyIssuerOfficers(q.awardingBodyIssuer, `National register update: "${q.title}" (${q.referenceId}) — ${action}. ${note}`);
    }
    await logActivity(req, { action: `qualification.${action}`, entity: "qualification", entityId: q.referenceId || String(q._id), summary: `${action[0].toUpperCase()}${action.slice(1)} decision on "${q.title}" (${q.referenceId})` });
    res.json({ qualification: view(q, { full: true }) });
  } catch (err) { next(err); }
});

export default router;
