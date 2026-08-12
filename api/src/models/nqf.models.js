// NQF knowledge base (spec §3–§5). Framework rules are stored as structured, effective-dated,
// versioned records — never hard-coded conditions. Historical records are never overwritten:
// corrections and amendments create NEW versions/events, and the previous record stays visible.
// Like the rest of Mongo this is Tier-3 auxiliary data for queries; once the QualificationRegistry
// contract lands (Phase 3), registered-qualification fingerprints are anchored on-chain.
import mongoose from "mongoose";

// --- nqf_versions: the framework editions (e.g. ZM-NQF 2025) -----------------
// A qualification is always judged under the version effective on the relevant date;
// a later framework must never silently re-judge an earlier award (spec §3.2).
const nqfVersionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true }, // e.g. "ZM-NQF-2025"
    title: { type: String, required: true },
    gazetteRef: { type: String }, // e.g. "Gazette Notice No. 1429 of 2025"
    effectiveFrom: { type: Date, required: true, index: true },
    effectiveTo: { type: Date, default: null }, // null = still in force
    status: { type: String, enum: ["draft", "active", "superseded"], default: "active" },
    notes: { type: String },
  },
  { timestamps: true }
);

// --- nqf_levels: the ten levels + descriptors per framework version ----------
// Descriptors follow the revised framework's three domains (spec §6).
const nqfLevelSchema = new mongoose.Schema(
  {
    version: { type: mongoose.Schema.Types.ObjectId, ref: "NQFVersion", required: true, index: true },
    versionCode: { type: String, required: true, index: true }, // denormalised for cheap lookups
    level: { type: Number, required: true, min: 1, max: 10 },
    title: { type: String, required: true }, // e.g. "Level 7 — Bachelor's Degree"
    descriptors: {
      knowledge: { type: String, required: true },
      skills: { type: String, required: true },
      autonomyResponsibility: { type: String, required: true },
    },
    typicalQualifications: { type: [String], default: [] },
  },
  { timestamps: true }
);
nqfLevelSchema.index({ version: 1, level: 1 }, { unique: true });

// --- sub_frameworks: General Education / TEVET / Higher Education (spec §4) --
const subFrameworkSchema = new mongoose.Schema(
  {
    version: { type: mongoose.Schema.Types.ObjectId, ref: "NQFVersion", required: true, index: true },
    versionCode: { type: String, required: true, index: true },
    code: { type: String, enum: ["general", "tevet", "higher_ed"], required: true },
    name: { type: String, required: true },
    authority: { type: String, required: true }, // appropriate authority: ECZ / TEVETA / HEA
    // which platform role acts for this authority ("ecz" | "hea"; TEVETA portal is a later phase)
    authorityRole: { type: String },
    levelRange: { min: { type: Number, min: 1, max: 10 }, max: { type: Number, min: 1, max: 10 } },
    typicalQualifications: { type: [String], default: [] },
  },
  { timestamps: true }
);
subFrameworkSchema.index({ version: 1, code: 1 }, { unique: true });

// --- registered_qualifications: the national register (spec §5.1, §7) --------
// One document per qualification VERSION. Amendments never edit in place: they create a new
// document (version+1) linked through previousVersion/supersededBy, each with its own
// fingerprint, so the historical fingerprint chain is preserved (acceptance test
// "Qualification amendment"). Credentials must inherit nqfLevel/frameworkVersion from here —
// institutions never type the level themselves (spec §5.2).
const registeredQualificationSchema = new mongoose.Schema(
  {
    referenceId: { type: String, index: true }, // national reference ID, assigned at ZAQA registration
    title: { type: String, required: true, index: true },
    qualificationType: { type: String, enum: ["full", "part", "micro_credential"], default: "full" },
    nqfLevel: { type: Number, required: true, min: 1, max: 10 },
    acqfLevel: { type: Number, min: 1, max: 10 }, // African Continental QF mapping, where available
    frameworkVersion: { type: String, required: true, index: true }, // NQFVersion.code at registration
    // official current mapping under a later framework, if ZAQA approves one (spec §3.2):
    // the original level above is retained; this records the mapped level only.
    currentMappedLevel: { type: Number, min: 1, max: 10 },
    currentMappedVersion: { type: String },
    subFramework: { type: String, enum: ["general", "tevet", "higher_ed"], required: true, index: true },
    fieldOfEducation: { type: String },
    relatedOccupation: { type: String },
    purpose: { type: String },
    learningOutcomes: { type: [String], default: [] },
    assessmentCriteria: { type: [String], default: [] },
    creditValue: { type: Number },
    notionalHours: { type: Number },
    minEntryRequirements: { type: [String], default: [] },
    progressionRoutes: { type: [String], default: [] },
    rplAvailable: { type: Boolean, default: false },
    awardingBody: { type: String, required: true },
    awardingBodyIssuer: { type: mongoose.Schema.Types.ObjectId, ref: "Issuer" },
    approvedProviders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Issuer" }],
    qaAuthority: { type: String }, // accrediting / quality-assurance authority

    registrationDate: { type: Date },
    effectiveDate: { type: Date },
    expiryDate: { type: Date },
    renewalDate: { type: Date },
    status: {
      type: String,
      enum: ["draft", "submitted", "under_review", "registered", "suspended", "expired", "deregistered", "rejected"],
      default: "draft",
      index: true,
    },

    // --- amendment / version chain (append-only) -----------------------------
    qualificationVersion: { type: Number, default: 1 },
    previousVersion: { type: mongoose.Schema.Types.ObjectId, ref: "RegisteredQualification" },
    supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: "RegisteredQualification" },

    // sha256 fingerprint of the regulated fields, computed at registration; anchored
    // on-chain by the QualificationRegistry contract in Phase 3.
    fingerprint: { type: String, index: true },
    fingerprintAnchorTx: { type: String },

    // complete regulatory timeline — history is appended, never rewritten
    events: [{ at: Date, actor: String, action: String, note: String }],
  },
  { timestamps: true }
);
// referenceId repeats across amendment versions; only one document per (referenceId, version).
registeredQualificationSchema.index(
  { referenceId: 1, qualificationVersion: 1 },
  { unique: true, partialFilterExpression: { referenceId: { $type: "string" } } }
);

// --- nqf_policies: configurable, effective-dated policy values (spec §12, §13) ---
// e.g. the maximum NQF level for RPL certification, CATS transfer caps, micro-credential
// controls. Updating a policy creates a NEW document with a later effectiveFrom; the old
// value stays for historical decisions.
const nqfPolicySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, index: true }, // e.g. "rpl.maxCertificationLevel"
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    description: { type: String },
    effectiveFrom: { type: Date, required: true, default: Date.now },
    setBy: { type: String }, // actor email
  },
  { timestamps: true }
);
nqfPolicySchema.index({ key: 1, effectiveFrom: -1 });

// --- progression_rules: official access/mobility pathways (spec §10) ---------
// Encoded as rules so the engine can show valid alternative routes instead of
// unexplained rejections.
const progressionRuleSchema = new mongoose.Schema(
  {
    version: { type: mongoose.Schema.Types.ObjectId, ref: "NQFVersion", required: true, index: true },
    versionCode: { type: String, required: true, index: true },
    fromLevel: { type: Number, required: true, min: 1, max: 10 },
    toLevel: { type: Number, required: true, min: 1, max: 10 },
    direct: { type: Boolean, default: true }, // direct entry supported
    requirement: { type: String }, // human-readable condition, cited in every decision
  },
  { timestamps: true }
);
progressionRuleSchema.index({ version: 1, fromLevel: 1, toLevel: 1 }, { unique: true });

export const NQFVersion = mongoose.model("NQFVersion", nqfVersionSchema);
export const NQFLevel = mongoose.model("NQFLevel", nqfLevelSchema);
export const SubFramework = mongoose.model("SubFramework", subFrameworkSchema);
export const RegisteredQualification = mongoose.model("RegisteredQualification", registeredQualificationSchema);
export const NQFPolicy = mongoose.model("NQFPolicy", nqfPolicySchema);
export const ProgressionRule = mongoose.model("ProgressionRule", progressionRuleSchema);
