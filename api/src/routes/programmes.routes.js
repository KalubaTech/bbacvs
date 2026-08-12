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

const router = Router();

function view(p) {
  return {
    id: p._id, name: p.name, zqfLevel: p.zqfLevel, status: p.status,
    institution: p.institution, note: p.note, createdAt: p.createdAt,
    qualificationRef: p.qualificationRef,
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
    await p.save();
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
    p.status = "approved";
    await p.save();
    await Issuer.updateOne({ _id: p.issuer._id }, { $addToSet: { accreditedPrograms: p.name } });
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
    p.status = "rejected";
    p.note = req.body.reason || "";
    await p.save();
    res.json({ programme: view(p) });
  } catch (err) { next(err); }
});

export default router;
