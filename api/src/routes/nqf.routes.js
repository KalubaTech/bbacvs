// NQF knowledge-base APIs (spec §21.1): framework versions, level descriptors, progression
// checks and effective-dated policy values. Reads are public — the framework is a published
// national instrument; policy writes are ZAQA-only and append-only (a new effective-dated
// record, never an edit).
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES, GOVERNANCE_ROLES } from "../middleware/auth.js";
import { NQFVersion, NQFPolicy } from "../models/index.js";
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
