// Programme accreditation workflow — a MANUAL, regulator-approved operation (institutions are
// few, so every programme is reviewed by a person at the relevant authority). An accredited
// institution creates programmes and submits them to its regulator — the HEA for higher-ed
// institutions, TEVETA for TEVET institutions — which approves or rejects them. Approved
// programmes are added to the institution's accredited-programme list (surfaced to ZAQA +
// verifiers).
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES } from "../middleware/auth.js";
import { Programme, Issuer, RegisteredQualification } from "../models/index.js";
import { logActivity } from "../services/activity.service.js";
import { pushEvent } from "../services/history.service.js";

const router = Router();

// Regulator that accredits programmes for an institution sector (the highest level of
// programme approval). ZAQA never accredits programmes — it reads the regulator's decisions
// for validation and verification.
export function regulatorFor(sector) {
  if (sector === "tevet") return "TEVETA";
  if (sector === "secondary") return "ECZ";
  return "HEA";
}

function view(p) {
  const sector = p.issuer && typeof p.issuer === "object" ? p.issuer.sector : undefined;
  return {
    id: p._id, name: p.name, zqfLevel: p.zqfLevel, status: p.status,
    institution: p.institution, note: p.note, createdAt: p.createdAt,
    qualificationRef: p.qualificationRef,
    sector, regulator: sector ? regulatorFor(sector) : undefined,
    credentialType: p.credentialType, inceptionYear: p.inceptionYear,
    cycles: (p.cycles || []).map((c) => ({
      id: c._id, label: c.label, startYear: c.startYear, endYear: c.endYear ?? null, intake: c.intake,
      zqfLevel: c.zqfLevel ?? null, accreditationRef: c.accreditationRef || "",
      status: c.status || "offered", note: c.note,
      courses: (c.courses || []).map((k) => ({ code: k.code, title: k.title, year: k.year, semester: k.semester, credits: k.credits })),
    })),
    decidedAt: ["approved", "rejected"].includes(p.status)
      ? [...(p.events || [])].reverse().find((e) => /accredited|rejected/.test(e.action || ""))?.at
      : undefined,
    events: p.events || [],
  };
}

// ---- institution side -----------------------------------------------------

// POST /api/programmes (institution) — create a draft programme. Requires HEA approval first.
// When the programme delivers a nationally registered qualification, pass qualificationId and
// the NQF level is inherited from the register (never typed by the institution — spec §5.2).
const createSchema = Joi.object({
  name: Joi.string().min(2).max(160).required(),
  zqfLevel: Joi.number().integer().min(1).max(10).optional(),
  qualificationId: Joi.string().hex().length(24).optional(),
});
router.post("/", requireAuth, requireRole(ROLES.ISSUER), validate(createSchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.user.issuerId);
    if (!issuer) return res.status(403).json({ error: "Issuer profile not found" });
    if ((issuer.heaStatus || "approved") !== "approved") {
      const regulator = issuer.sector === "tevet" ? "TEVETA" : "HEA";
      return res.status(403).json({ error: `Your institution must be ${regulator}-approved before creating programmes.` });
    }
    let qual = null;
    if (req.body.qualificationId) {
      qual = await RegisteredQualification.findById(req.body.qualificationId).lean();
      if (!qual || qual.status !== "registered") {
        return res.status(400).json({ error: "That qualification is not on the active national register." });
      }
      const allowed = String(qual.awardingBodyIssuer || "") === String(issuer._id)
        || (qual.approvedProviders || []).some((id) => String(id) === String(issuer._id));
      if (!allowed) {
        return res.status(403).json({ error: "Your institution is not an approved provider of that registered qualification." });
      }
    }
    const p = await Programme.create({
      issuer: issuer._id, institution: issuer.institution,
      name: req.body.name,
      // Registered qualification wins: the level is inherited, never typed.
      zqfLevel: qual ? (qual.currentMappedLevel || qual.nqfLevel) : req.body.zqfLevel,
      qualification: qual?._id, qualificationRef: qual?.referenceId,
      status: "draft",
    });
    pushEvent(p, req, "programme.created");
    await p.save();
    await logActivity(req, { action: "programme.create", entity: "programme", entityId: String(p._id), summary: `Created programme ${p.name} (${issuer.institution})` });
    res.status(201).json({ programme: view(p) });
  } catch (err) { next(err); }
});

// GET /api/programmes/mine (institution)
router.get("/mine", requireAuth, requireRole(ROLES.ISSUER), async (req, res, next) => {
  try {
    const rows = await Programme.find({ issuer: req.user.issuerId }).sort({ createdAt: -1 }).lean();
    res.json({ programmes: rows.map(view) });
  } catch (err) { next(err); }
});

// POST /api/programmes/:id/submit (institution) — submit a draft programme to the HEA.
router.post("/:id/submit", requireAuth, requireRole(ROLES.ISSUER), async (req, res, next) => {
  try {
    const p = await Programme.findOne({ _id: req.params.id, issuer: req.user.issuerId });
    if (!p) return res.status(404).json({ error: "Programme not found" });
    if (p.status !== "draft") return res.status(400).json({ error: `Already submitted (status: ${p.status}).` });
    p.status = "pending";
    pushEvent(p, req, "programme.submitted", undefined, { from: "draft", to: "pending" });
    await p.save();
    await logActivity(req, { action: "programme.submit", entity: "programme", entityId: String(p._id), summary: `Submitted programme ${p.name} for accreditation` });
    res.json({ programme: view(p) });
  } catch (err) { next(err); }
});

// PUT /api/programmes/:id/catalogue (institution) — replace the programme's cycle register:
// inception year, award type, and every cycle it has run with the courses offered. Editable in
// any lifecycle state; the regulator's accreditation decision is untouched.
const courseSchema = Joi.object({
  code: Joi.string().max(40).allow("").optional(),
  title: Joi.string().min(1).max(200).required(),
  year: Joi.number().integer().min(1).max(10).optional().allow(null),
  semester: Joi.string().max(40).allow("").optional(),
  credits: Joi.number().min(0).max(1000).optional().allow(null),
});
const cycleSchema = Joi.object({
  label: Joi.string().max(80).allow("").optional(),
  startYear: Joi.number().integer().min(1900).max(2100).required(),
  endYear: Joi.number().integer().min(1900).max(2100).optional().allow(null),
  intake: Joi.string().max(80).allow("").optional(),
  zqfLevel: Joi.number().integer().min(1).max(10).optional().allow(null),
  accreditationRef: Joi.string().max(120).allow("").optional(),
  status: Joi.string().valid("offered", "suspended", "discontinued").default("offered"),
  note: Joi.string().max(300).allow("").optional(),
  courses: Joi.array().items(courseSchema).max(200).default([]),
});
const catalogueSchema = Joi.object({
  credentialType: Joi.string().valid("secondary", "diploma", "degree", "masters", "phd", "other").optional().allow(null, ""),
  inceptionYear: Joi.number().integer().min(1900).max(2100).optional().allow(null),
  cycles: Joi.array().items(cycleSchema).max(100).required(),
});
router.put("/:id/catalogue", requireAuth, requireRole(ROLES.ISSUER, ROLES.ECZ), validate(catalogueSchema), async (req, res, next) => {
  try {
    const p = await Programme.findOne({ _id: req.params.id, issuer: req.user.issuerId });
    if (!p) return res.status(404).json({ error: "Programme not found" });
    for (const c of req.body.cycles) {
      if (c.endYear != null && c.endYear < c.startYear) {
        return res.status(400).json({ error: `Cycle ${c.label || c.startYear}: end year is before start year.` });
      }
    }
    const before = (p.cycles || []).length;
    p.credentialType = req.body.credentialType || undefined;
    p.inceptionYear = req.body.inceptionYear ?? undefined;
    p.cycles = req.body.cycles.map((c) => ({
      ...c, label: c.label || `${c.startYear}${c.endYear != null && c.endYear !== c.startYear ? `–${c.endYear}` : ""}`,
      endYear: c.endYear ?? undefined, zqfLevel: c.zqfLevel ?? undefined, accreditationRef: c.accreditationRef || undefined,
    }));
    pushEvent(p, req, "programme.catalogue_updated", undefined, {
      cyclesBefore: before, cyclesAfter: p.cycles.length,
      courses: p.cycles.reduce((n, c) => n + (c.courses || []).length, 0),
      inceptionYear: p.inceptionYear, credentialType: p.credentialType,
    });
    await p.save();
    await logActivity(req, { action: "programme.catalogue", entity: "programme", entityId: String(p._id), summary: `Updated cycle register for ${p.name} (${p.cycles.length} cycle${p.cycles.length === 1 ? "" : "s"})` });
    res.json({ programme: view(p) });
  } catch (err) { next(err); }
});

// ---- regulator side (HEA for higher-ed, TEVETA for TEVET) ------------------
const regulatorOnly = [requireAuth, requireRole(ROLES.HEA, ROLES.TEVETA, ROLES.ADMIN)];

// Whether this regulator seat oversees the given institution sector (admin oversees all).
function regulates(role, sector) {
  if (role === ROLES.ADMIN) return true;
  if (role === ROLES.TEVETA) return sector === "tevet";
  if (role === ROLES.HEA) return sector !== "tevet" && sector !== "secondary";
  return false;
}

// GET /api/programmes (HEA/TEVETA/ECZ/ZAQA/admin) — every programme with its accreditation
// outcome. Regulators see their own sector; ZAQA (and admin) see the national picture, read
// only — programme accreditation is decided by HEA / TEVETA / ECZ, and ZAQA taps into those
// decisions for validation and verification. ?status= narrows to one lifecycle state.
const readerRoles = [requireAuth, requireRole(ROLES.HEA, ROLES.TEVETA, ROLES.ECZ, ROLES.ZAQA, ROLES.ADMIN)];
router.get("/", ...readerRoles, async (req, res, next) => {
  try {
    const q = req.query.status ? { status: req.query.status } : {};
    const rows = await Programme.find(q).sort({ createdAt: -1 }).limit(500).populate("issuer", "sector").lean();
    const role = req.user.role;
    const mine = rows.filter((p) => {
      const sector = p.issuer?.sector;
      if (role === ROLES.ZAQA || role === ROLES.ADMIN) return true;
      if (role === ROLES.ECZ) return sector === "secondary";
      return regulates(role, sector);
    });
    res.json({ programmes: mine.map(view) });
  } catch (err) { next(err); }
});

// GET /api/programmes/pending (HEA/TEVETA) — programmes awaiting accreditation, scoped to the
// sector the actor regulates.
router.get("/pending", ...regulatorOnly, async (req, res, next) => {
  try {
    const rows = await Programme.find({ status: "pending" })
      .sort({ createdAt: -1 }).populate("issuer", "sector").lean();
    const mine = rows.filter((p) => regulates(req.user.role, p.issuer?.sector));
    res.json({ programmes: mine.map(view) });
  } catch (err) { next(err); }
});

// POST /api/programmes/:id/approve (HEA/TEVETA) — accredit a programme (also adds it to the
// institution's accredited-programme list).
router.post("/:id/approve", ...regulatorOnly, async (req, res, next) => {
  try {
    const p = await Programme.findById(req.params.id).populate("issuer", "sector");
    if (!p) return res.status(404).json({ error: "Programme not found" });
    if (!regulates(req.user.role, p.issuer?.sector)) {
      return res.status(403).json({ error: "This programme belongs to another regulator's sector." });
    }
    const from = p.status;
    p.status = "approved";
    pushEvent(p, req, "programme.accredited", undefined, { from, to: "approved" });
    await p.save();
    await Issuer.updateOne({ _id: p.issuer._id }, { $addToSet: { accreditedPrograms: p.name } });
    await logActivity(req, { action: "programme.approve", entity: "programme", entityId: String(p._id), summary: `Accredited programme ${p.name} (${p.institution})` });
    res.json({ programme: view(p) });
  } catch (err) { next(err); }
});

// POST /api/programmes/:id/reject (HEA/TEVETA)
const rejectSchema = Joi.object({ reason: Joi.string().max(300).allow("").optional() });
router.post("/:id/reject", ...regulatorOnly, validate(rejectSchema), async (req, res, next) => {
  try {
    const p = await Programme.findById(req.params.id).populate("issuer", "sector");
    if (!p) return res.status(404).json({ error: "Programme not found" });
    if (!regulates(req.user.role, p.issuer?.sector)) {
      return res.status(403).json({ error: "This programme belongs to another regulator's sector." });
    }
    const from = p.status;
    p.status = "rejected";
    p.note = req.body.reason || "";
    pushEvent(p, req, "programme.rejected", req.body.reason || undefined, { from, to: "rejected" });
    await p.save();
    await logActivity(req, { action: "programme.reject", entity: "programme", entityId: String(p._id), summary: `Rejected programme ${p.name} (${p.institution})` });
    res.json({ programme: view(p) });
  } catch (err) { next(err); }
});

export default router;
