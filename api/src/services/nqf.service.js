// NQF intelligence layer (spec §3, §10). Resolves the framework version effective on a given
// date, computes registered-qualification fingerprints, reads effective-dated policy values and
// evaluates progression rules with explainable pathways. Every answer cites the version/rule it
// came from so downstream decisions stay reproducible under the framework applicable at the time.
import crypto from "node:crypto";
import {
  NQFVersion,
  NQFLevel,
  SubFramework,
  NQFPolicy,
  ProgressionRule,
} from "../models/index.js";

/**
 * The framework version effective on `date` (default now): effectiveFrom <= date and
 * (effectiveTo is null or date < effectiveTo). Falls back to the most recent active
 * version if none matches (e.g. a date before the first framework).
 */
export async function versionEffectiveOn(date = new Date()) {
  const d = new Date(date);
  const match = await NQFVersion.findOne({
    status: { $ne: "draft" },
    effectiveFrom: { $lte: d },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: d } }],
  }).sort({ effectiveFrom: -1 }).lean();
  if (match) return match;
  return NQFVersion.findOne({ status: "active" }).sort({ effectiveFrom: -1 }).lean();
}

/** Full view of one framework version: levels (with descriptors) + sub-frameworks. */
export async function frameworkView(versionCode) {
  const version = await NQFVersion.findOne({ code: versionCode }).lean();
  if (!version) return null;
  const [levels, subFrameworks] = await Promise.all([
    NQFLevel.find({ version: version._id }).sort({ level: 1 }).lean(),
    SubFramework.find({ version: version._id }).lean(),
  ]);
  return { version, levels, subFrameworks };
}

/** One level's descriptors under a version code (or the version effective on `date`). */
export async function levelView(level, { versionCode, date } = {}) {
  const version = versionCode
    ? await NQFVersion.findOne({ code: versionCode }).lean()
    : await versionEffectiveOn(date || new Date());
  if (!version) return null;
  const doc = await NQFLevel.findOne({ version: version._id, level }).lean();
  return doc ? { versionCode: version.code, ...doc } : null;
}

/**
 * Latest policy value effective on `date`. Returns { value, effectiveFrom, description }
 * or null when the key has never been set.
 */
export async function policyEffectiveOn(key, date = new Date()) {
  return NQFPolicy.findOne({ key, effectiveFrom: { $lte: new Date(date) } })
    .sort({ effectiveFrom: -1 })
    .lean();
}

// Regulated fields committed to by the registration fingerprint (spec §7.1). Changing any of
// them must produce a new qualification version with a new fingerprint.
const FINGERPRINT_FIELDS = [
  "referenceId", "title", "qualificationType", "nqfLevel", "frameworkVersion", "subFramework",
  "learningOutcomes", "assessmentCriteria", "creditValue", "notionalHours",
  "minEntryRequirements", "awardingBody", "effectiveDate", "expiryDate", "qualificationVersion",
];

/** Deterministic sha256 fingerprint over the regulated fields of a qualification. */
export function qualificationFingerprint(q) {
  const canonical = {};
  for (const f of FINGERPRINT_FIELDS) {
    let v = q[f];
    if (v instanceof Date) v = v.toISOString();
    if (Array.isArray(v)) v = v.map(String);
    canonical[f] = v === undefined ? null : v;
  }
  const json = JSON.stringify(canonical, Object.keys(canonical).sort());
  return "0x" + crypto.createHash("sha256").update(json).digest("hex");
}

/**
 * Progression check (spec §10): is direct entry from `fromLevel` to `toLevel` supported under
 * the given framework version? Never a bare rejection — when direct entry is not supported the
 * result lists valid alternative pathways composed from the rule table (shortest first).
 */
export async function checkProgression(fromLevel, toLevel, { versionCode, date } = {}) {
  const version = versionCode
    ? await NQFVersion.findOne({ code: versionCode }).lean()
    : await versionEffectiveOn(date || new Date());
  if (!version) return { error: "No NQF framework version available" };

  const rules = await ProgressionRule.find({ version: version._id }).lean();
  const directRule = rules.find((r) => r.fromLevel === fromLevel && r.toLevel === toLevel && r.direct);

  const base = {
    versionCode: version.code,
    fromLevel,
    toLevel,
    result: directRule ? "DIRECT_ENTRY_SUPPORTED" : "DIRECT_ENTRY_NOT_SUPPORTED",
    rule: directRule?.requirement || null,
  };
  if (directRule) return { ...base, pathways: [[fromLevel, toLevel]] };

  // BFS over the direct-rule graph for the shortest valid alternative routes.
  const edges = new Map(); // fromLevel -> [toLevel]
  for (const r of rules.filter((r) => r.direct)) {
    if (!edges.has(r.fromLevel)) edges.set(r.fromLevel, []);
    edges.get(r.fromLevel).push(r.toLevel);
  }
  const pathways = [];
  const queue = [[fromLevel]];
  while (queue.length && pathways.length < 3) {
    const path = queue.shift();
    if (path.length > 6) continue; // sane bound
    for (const next of edges.get(path[path.length - 1]) || []) {
      if (path.includes(next)) continue;
      const extended = [...path, next];
      if (next === toLevel) pathways.push(extended);
      else queue.push(extended);
    }
  }
  return { ...base, pathways };
}
