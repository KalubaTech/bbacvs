// NQF knowledge-base APIs (spec §21.1): framework versions, level descriptors, progression
// checks and effective-dated policy values. Reads are public — the framework is a published
// national instrument; policy writes are ZAQA-only and append-only (a new effective-dated
// record, never an edit).
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES, GOVERNANCE_ROLES } from "../middleware/auth.js";
import { NQFVersion, NQFLevel, SubFramework, ProgressionRule, NQFPolicy, RegisteredQualification } from "../models/index.js";
import {
  frameworkView,
  levelView,
  versionEffectiveOn,
  checkProgression,
  policyEffectiveOn,
} from "../services/nqf.service.js";
import { logActivity } from "../services/activity.service.js";

const router = Router();

// GET /api/nqf/frameworks — all framework versions (newest first).
router.get("/frameworks", async (_req, res, next) => {
  try {
    const versions = await NQFVersion.find().sort({ effectiveFrom: -1 }).lean();
    res.json({ frameworks: versions });
  } catch (err) { next(err); }
});

// GET /api/nqf/frameworks/current?date=YYYY-MM-DD — the version effective on a date (default: today).
router.get("/frameworks/current", async (req, res, next) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    if (isNaN(date)) return res.status(400).json({ error: "Invalid date" });
    const version = await versionEffectiveOn(date);
    if (!version) return res.status(404).json({ error: "No framework version configured" });
    res.json({ framework: version, effectiveOn: date.toISOString().slice(0, 10) });
  } catch (err) { next(err); }
});

// GET /api/nqf/frameworks/:code — one version with its levels, descriptors and sub-frameworks.
router.get("/frameworks/:code", async (req, res, next) => {
  try {
    const fw = await frameworkView(req.params.code);
    if (!fw) return res.status(404).json({ error: "Framework version not found" });
    res.json(fw);
  } catch (err) { next(err); }
});

// GET /api/nqf/levels/:level?version=ZM-NQF-2025&date=YYYY-MM-DD — level descriptors.
router.get("/levels/:level", async (req, res, next) => {
  try {
    const level = parseInt(req.params.level, 10);
    if (!(level >= 1 && level <= 10)) return res.status(400).json({ error: "Level must be 1–10" });
    const doc = await levelView(level, { versionCode: req.query.version, date: req.query.date });
    if (!doc) return res.status(404).json({ error: "Level not found for that framework version" });
    res.json({ level: doc });
  } catch (err) { next(err); }
});

// GET /api/nqf/progression?from=2&to=7&version= — explainable progression check with pathways.
router.get("/progression", async (req, res, next) => {
  try {
    const from = parseInt(req.query.from, 10);
    const to = parseInt(req.query.to, 10);
    if (!(from >= 1 && from <= 10 && to >= 1 && to <= 10)) {
      return res.status(400).json({ error: "from and to must be NQF levels 1–10" });
    }
    res.json(await checkProgression(from, to, { versionCode: req.query.version }));
  } catch (err) { next(err); }
});

// ---- framework configuration (ZAQA) ----------------------------------------
// The framework is configurational, not just informational: ZAQA edits level
// descriptors, publishes new effective-dated versions, and activation flows
// through automatically — registration, validation and recognition decisions
// always stamp the version in force (versionEffectiveOn / activeFrameworkCode).

const zaqaOnly = [requireAuth, requireRole(ROLES.ZAQA, ROLES.ADMIN)];

// PATCH /api/nqf/levels/:level — edit a level's descriptors on a version (default: in force).
const levelPatchSchema = Joi.object({
  version: Joi.string().max(40).optional(), // version code; default = version in force
  title: Joi.string().max(120).optional(),
  descriptors: Joi.object({
    knowledge: Joi.string().max(1200).optional(),
    skills: Joi.string().max(1200).optional(),
    autonomyResponsibility: Joi.string().max(1200).optional(),
  }).optional(),
  typicalQualifications: Joi.array().items(Joi.string().max(160)).optional(),
}).min(1);
router.patch("/levels/:level", ...zaqaOnly, validate(levelPatchSchema), async (req, res, next) => {
  try {
    const level = parseInt(req.params.level, 10);
    if (!(level >= 1 && level <= 10)) return res.status(400).json({ error: "Level must be 1–10" });
    const version = req.body.version
      ? await NQFVersion.findOne({ code: req.body.version })
      : await versionEffectiveOn();
    if (!version) return res.status(404).json({ error: "Framework version not found" });
    const doc = await NQFLevel.findOne({ version: version._id, level });
    if (!doc) return res.status(404).json({ error: "Level not found for that framework version" });
    if (req.body.title != null) doc.title = req.body.title;
    if (req.body.typicalQualifications) doc.typicalQualifications = req.body.typicalQualifications;
    if (req.body.descriptors) {
      doc.descriptors = { ...(doc.descriptors?.toObject?.() || doc.descriptors || {}), ...req.body.descriptors };
    }
    await doc.save();
    await logActivity(req, {
      action: "nqf.level.update", entity: "nqf_level", entityId: `${version.code}/L${level}`,
      summary: `Updated Level ${level} (${Object.keys(req.body).filter((k) => k !== "version").join(", ")}) on ${version.code}`,
    });
    res.json({ level: { versionCode: version.code, ...doc.toObject() } });
  } catch (err) { next(err); }
});

// POST /api/nqf/frameworks — publish a new draft version, cloned from an existing one.
const frameworkCreateSchema = Joi.object({
  code: Joi.string().pattern(/^[A-Z0-9-]{4,40}$/).required(),
  title: Joi.string().max(200).required(),
  gazetteRef: Joi.string().max(200).allow("").optional(),
  notes: Joi.string().max(600).allow("").optional(),
  effectiveFrom: Joi.date().optional(),
  cloneFrom: Joi.string().max(40).optional(), // version code; default = version in force
});
router.post("/frameworks", ...zaqaOnly, validate(frameworkCreateSchema), async (req, res, next) => {
  try {
    if (await NQFVersion.findOne({ code: req.body.code })) {
      return res.status(409).json({ error: "A framework version with that code already exists" });
    }
    const source = req.body.cloneFrom
      ? await NQFVersion.findOne({ code: req.body.cloneFrom }).lean()
      : await versionEffectiveOn();
    const draft = await NQFVersion.create({
      code: req.body.code,
      title: req.body.title,
      gazetteRef: req.body.gazetteRef,
      notes: req.body.notes,
      effectiveFrom: req.body.effectiveFrom || null,
      status: "draft",
    });
    // Clone levels, sub-frameworks and progression rules so the draft is editable in place.
    if (source) {
      const strip = ({ _id, __v, createdAt, updatedAt, ...rest }) => rest;
      const [levels, subs, rules] = await Promise.all([
        NQFLevel.find({ version: source._id }).lean(),
        SubFramework.find({ version: source._id }).lean(),
        ProgressionRule.find({ version: source._id }).lean(),
      ]);
      if (levels.length) await NQFLevel.insertMany(levels.map((l) => ({ ...strip(l), version: draft._id, versionCode: draft.code })));
      if (subs.length) await SubFramework.insertMany(subs.map((s) => ({ ...strip(s), version: draft._id })));
      if (rules.length) await ProgressionRule.insertMany(rules.map((r) => ({ ...strip(r), version: draft._id })));
    }
    await logActivity(req, {
      action: "nqf.version.create", entity: "nqf_version", entityId: draft.code,
      summary: `Created draft framework version ${draft.code}${source ? ` (cloned from ${source.code})` : ""}`,
    });
    res.status(201).json({ framework: draft });
  } catch (err) { next(err); }
});

// POST /api/nqf/frameworks/:code/activate — bring a draft version into force.
// The previous in-force version is superseded (effectiveTo stamped), and the national
// register is remapped: every registered qualification's currentMappedVersion moves to
// the new code, so certification decisions from this moment cite the new framework.
const activateSchema = Joi.object({ effectiveFrom: Joi.date().optional() });
router.post("/frameworks/:code/activate", ...zaqaOnly, validate(activateSchema), async (req, res, next) => {
  try {
    const draft = await NQFVersion.findOne({ code: req.params.code });
    if (!draft) return res.status(404).json({ error: "Framework version not found" });
    if (draft.status === "active") return res.status(409).json({ error: "Already in force" });
    const now = req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : new Date();
    const current = await NQFVersion.findOne({ status: "active" });
    if (current) {
      current.status = "superseded";
      current.effectiveTo = now;
      await current.save();
    }
    draft.status = "active";
    draft.effectiveFrom = now;
    draft.effectiveTo = null;
    await draft.save();
    // Auto-apply to the national register (levels carry over 1:1 in a cloned revision).
    const remap = await RegisteredQualification.updateMany(
      { status: { $in: ["registered", "suspended"] } },
      { $set: { currentMappedVersion: draft.code } }
    );
    await logActivity(req, {
      action: "nqf.version.activate", entity: "nqf_version", entityId: draft.code,
      summary: `Activated framework ${draft.code}${current ? ` (superseded ${current.code})` : ""}; remapped ${remap.modifiedCount} registered qualification(s)`,
    });
    res.json({ framework: draft, superseded: current?.code || null, remappedQualifications: remap.modifiedCount });
  } catch (err) { next(err); }
});

// PATCH /api/nqf/frameworks/:code — edit version metadata (draft or in force).
const frameworkPatchSchema = Joi.object({
  title: Joi.string().max(200).optional(),
  gazetteRef: Joi.string().max(200).allow("").optional(),
  notes: Joi.string().max(600).allow("").optional(),
  effectiveFrom: Joi.date().optional(), // draft only
}).min(1);
router.patch("/frameworks/:code", ...zaqaOnly, validate(frameworkPatchSchema), async (req, res, next) => {
  try {
    const fw = await NQFVersion.findOne({ code: req.params.code });
    if (!fw) return res.status(404).json({ error: "Framework version not found" });
    if (req.body.effectiveFrom && fw.status !== "draft") {
      return res.status(409).json({ error: "Effective date can only change while the version is a draft" });
    }
    for (const k of ["title", "gazetteRef", "notes", "effectiveFrom"]) {
      if (req.body[k] != null) fw[k] = req.body[k];
    }
    await fw.save();
    await logActivity(req, {
      action: "nqf.version.update", entity: "nqf_version", entityId: fw.code,
      summary: `Updated framework ${fw.code} (${Object.keys(req.body).join(", ")})`,
    });
    res.json({ framework: fw });
  } catch (err) { next(err); }
});

// ---- policy values (RPL / CATS / micro-credential controls) -----------------

// GET /api/nqf/policies (governance) — the value of every key effective today, with history counts.
router.get("/policies", requireAuth, requireRole(...GOVERNANCE_ROLES), async (_req, res, next) => {
  try {
    const keys = await NQFPolicy.distinct("key");
    const policies = [];
    for (const key of keys.sort()) {
      const current = await policyEffectiveOn(key);
      const versions = await NQFPolicy.countDocuments({ key });
      policies.push({ key, ...current, versions });
    }
    res.json({ policies });
  } catch (err) { next(err); }
});

// GET /api/nqf/policies/:key/history (governance) — full effective-dated history of one key.
router.get("/policies/:key/history", requireAuth, requireRole(...GOVERNANCE_ROLES), async (req, res, next) => {
  try {
    const history = await NQFPolicy.find({ key: req.params.key }).sort({ effectiveFrom: -1 }).lean();
    res.json({ key: req.params.key, history });
  } catch (err) { next(err); }
});

// POST /api/nqf/policies (ZAQA) — set a policy value. Append-only: creates a new
// effective-dated record; earlier values remain for historical decisions.
const policySchema = Joi.object({
  key: Joi.string().pattern(/^[a-z][a-zA-Z0-9_.]{1,80}$/).required(),
  value: Joi.any().required(),
  description: Joi.string().max(400).allow("").optional(),
  effectiveFrom: Joi.date().optional(),
});
router.post("/policies", requireAuth, requireRole(ROLES.ZAQA, ROLES.ADMIN), validate(policySchema), async (req, res, next) => {
  try {
    const doc = await NQFPolicy.create({
      key: req.body.key,
      value: req.body.value,
      description: req.body.description,
      effectiveFrom: req.body.effectiveFrom || new Date(),
      setBy: req.user.email,
    });
    await logActivity(req, {
      action: "nqf.policy.set", entity: "nqf_policy", entityId: doc.key,
      summary: `Set NQF policy ${doc.key} = ${JSON.stringify(doc.value)}`,
    });
    res.status(201).json({ policy: doc });
  } catch (err) { next(err); }
});

export default router;
