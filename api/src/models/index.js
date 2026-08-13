// MongoDB Atlas — NON-AUTHORITATIVE auxiliary index (Tier 3). Every collection here is
// reconstructable from on-chain events + IPFS; it exists to accelerate queries and hold
// off-chain account/issuer metadata. Never the source of truth for credential validity.
import mongoose from "mongoose";
import { config } from "../config/index.js";

export async function connectDB() {
  if (!config.mongoUri) {
    console.warn("[db] MONGODB_URI not set — running without auxiliary index");
    return null;
  }
  await mongoose.connect(config.mongoUri);
  console.log("[db] connected:", config.mongoUri.replace(/\/\/.*@/, "//"));
  return mongoose.connection;
}

// Shared append-only event entry: complete regulatory history for a record.
// `meta` carries structured decision context (rule results, evidence refs,
// policy/framework version, previous → new status) — never overwritten.
const eventEntry = {
  at: { type: Date, default: Date.now },
  actor: String,      // email of the acting user (or "system")
  actorRole: String,  // admin | zaqa | hea | teveta | ecz | issuer | holder | system
  action: { type: String, required: true },
  note: String,
  meta: Object,
};

// --- users: admin / issuer / holder accounts -------------------------------
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },
    // admin = platform super-user; zaqa/hea/teveta/ecz = national governance seats;
    // issuer = college/university; holder = graduate.
    role: {
      type: String,
      enum: ["admin", "zaqa", "hea", "teveta", "ecz", "issuer", "holder"],
      required: true,
    },
    name: { type: String },
    // Personal profile (self-maintained; mainly for holders — pre-fills applications & billing).
    phone: { type: String },
    nationalId: { type: String }, // NRC / passport
    address: { type: String },
    holderDID: { type: String, index: true }, // for students
    // for issuer users AND for the ECZ authority (which is itself a secondary-sector issuer).
    issuer: { type: mongoose.Schema.Types.ObjectId, ref: "Issuer" },
  },
  { timestamps: true }
);

// --- issuers: accredited institutions (dynamic) ----------------------------
const issuerSchema = new mongoose.Schema(
  {
    institution: { type: String, required: true },
    did: { type: String, required: true },
    walletAddress: { type: String, required: true, unique: true, index: true }, // on-chain issuer
    encPrivateKey: { type: String, required: true }, // AES-256-GCM encrypted VC/QR signing key (Crypto Engine)
    publicKey: { type: String, required: true }, // secp256k1 compressed (offline verify)
    // 'server' = API anchors with a server-held key; 'metamask' = the institution signs the
    // anchoring tx client-side (walletAddress is their MetaMask account, no server tx key).
    signingMode: { type: String, enum: ["server", "metamask"], default: "server" },
    onChain: { type: Boolean, default: false },
    registrationTx: { type: String },

    // --- governance layer (app-layer, non-authoritative) --------------------
    // Which regulator oversees this issuer: HE institutions are regulated by the HEA,
    // TEVET (technical/vocational) institutions by TEVETA;
    // 'secondary' covers the ECZ authority itself (not HEA-regulated).
    sector: { type: String, enum: ["higher_ed", "tevet", "secondary"], default: "higher_ed" },
    // Regulator compliance status (HEA for higher-ed, TEVETA for tevet, ECZ for secondary).
    // Issuers must be 'approved' to issue on the platform.
    // Legacy issuers created before this field read as undefined and are treated as approved.
    heaStatus: { type: String, enum: ["pending", "approved", "suspended"] },
    heaNote: { type: String }, // last regulator decision note (approval/suspension reason)
    // Programs the regulator has accredited this institution to award (informational for the demo).
    accreditedPrograms: { type: [String], default: [] },
    // ZAQA national trusted-issuer registry flag + ZQF-level range this issuer is recognised for.
    zaqaTrusted: { type: Boolean, default: false },
    zaqaNote: { type: String },

    // --- public institution profile (self-maintained by the institution) -----
    contactEmail: { type: String, lowercase: true },
    contactPhone: { type: String },
    physicalAddress: { type: String },
    website: { type: String },

    // --- self-service onboarding -------------------------------------------
    // true when the institution created its own account (vs. seeded / admin-created).
    selfRegistered: { type: Boolean, default: false },
    // IPFS CID of the HEA accreditation certificate the institution uploaded at registration.
    accreditationCid: { type: String },
    accreditationName: { type: String }, // original filename (display)
    accreditationMime: { type: String }, // for correct download content-type
    approvedBy: { type: String },        // "HEA" | "TEVETA" | "ECZ" | "admin" — who approved
    rejectedReason: { type: String },

    // complete regulatory history (registration, accreditation decisions,
    // suspensions, trust changes) — appended, never rewritten
    events: [eventEntry],
  },
  { timestamps: true }
);

// --- credentials_index: query cache + holder lookup ------------------------
const credentialIndexSchema = new mongoose.Schema(
  {
    credentialHash: { type: String, required: true, unique: true, index: true },
    cid: { type: String, required: true },
    issuer: { type: mongoose.Schema.Types.ObjectId, ref: "Issuer" },
    issuerAddress: { type: String, index: true },
    issuerDID: { type: String },
    institution: { type: String },
    issuerPublicKey: { type: String },
    holderDID: { type: String, index: true },
    holderEmail: { type: String, lowercase: true, index: true },
    subjectName: { type: String },
    holderNationalId: { type: String }, // NRC / passport (shown on the ZAQA verification cert)
    qualification: { type: String },
    graduationYear: { type: Number },
    // ZQF (national qualifications framework) level, and the kind of qualification.
    zqfLevel: { type: Number, min: 1, max: 10 },
    credentialType: {
      type: String,
      enum: ["secondary", "diploma", "degree", "masters", "phd", "other"],
      default: "other",
    },
    // pending   – prepared (MetaMask flow) but not yet anchored
    // active    – anchored and in good standing
    // suspended – temporarily withdrawn pending investigation (off-chain state;
    //             on-chain the credential stays VERIFIED until revoked)
    // revoked   – revoked on-chain (terminal; may be superseded by a reissue)
    status: { type: String, enum: ["pending", "active", "suspended", "revoked"], default: "active" },
    reasonCode: { type: Number, default: 0 },
    // Supersession chain (finding: preserve history instead of overwriting).
    // A corrected credential is issued as a NEW record; the old one is revoked
    // with reason AdministrativeError and linked both ways.
    supersededBy: { type: String }, // hash of the replacing credential
    supersedes: { type: String },   // hash of the credential this one replaces
    suspension: {
      reason: { type: String },
      suspendedAt: { type: Date },
      suspendedBy: { type: String },
      reinstatedAt: { type: Date },
      reinstatedBy: { type: String },
    },
    // ZAQA validation lifecycle (independent of on-chain status):
    //  draft            – institution created it, not yet submitted to ZAQA
    //  pending          – submitted, awaiting ZAQA validation (PENDING_ZAQA_VALIDATION)
    //  validated        – ZAQA confirmed national recognition
    //  rejected         – ZAQA rejected the submission
    //  suspicious       – flagged for review
    //  suspended        – temporarily withdrawn by ZAQA
    //  under_dispute    – a dispute/appeal is open
    zaqaValidation: {
      type: String,
      enum: ["draft", "pending", "validated", "rejected", "suspicious", "suspended", "under_dispute"],
      default: "draft",
    },
    zaqaNote: { type: String },
    zaqaRef: { type: String },        // ZAQA reference number, assigned when validated
    zaqaValidatedAt: { type: Date },  // date of validation (shown on the certificate)
    // Automated validation report (spec §6): explainable checks + risk + recommendation.
    validationReport: { type: Object },
    // Every validation run is preserved (latest also mirrored above).
    validationReports: { type: [Object], default: [] },
    // NQF framework version the validation decision was made under (e.g. "ZM-NQF-2025").
    frameworkVersion: { type: String },
    // Graduate-raised correction request (holder → issuer/regulator).
    correctionRequest: {
      status: { type: String, enum: ["none", "open", "resolved"], default: "none" },
      message: { type: String },
      requestedAt: { type: Date },
    },
    qrPayload: { type: Object },
    anchorTx: { type: String },
    issuedAt: { type: Date, default: Date.now },

    // complete credential lifecycle history — appended, never rewritten
    events: [eventEntry],
  },
  { timestamps: true }
);

// --- programmes: institution programmes accredited by the HEA --------------
const programmeSchema = new mongoose.Schema(
  {
    issuer: { type: mongoose.Schema.Types.ObjectId, ref: "Issuer", required: true, index: true },
    institution: { type: String },
    name: { type: String, required: true },
    zqfLevel: { type: Number, min: 1, max: 10 },
    // Backing entry in the national qualifications register (NQF integration). When set, the
    // level above is INHERITED from the register — the institution never types it (spec §5.2).
    qualification: { type: mongoose.Schema.Types.ObjectId, ref: "RegisteredQualification" },
    qualificationRef: { type: String }, // national reference ID, e.g. ZAQA-Q-2026-0001
    // draft → institution created it; pending → submitted to HEA; approved/rejected → HEA decision.
    status: { type: String, enum: ["draft", "pending", "approved", "rejected"], default: "draft" },
    note: { type: String },
    // accreditation decision history — appended, never rewritten
    events: [eventEntry],
  },
  { timestamps: true }
);

// --- applications: graduate-initiated request to digitize an existing credential ---
const applicationSchema = new mongoose.Schema(
  {
    applicantId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    applicantEmail: { type: String, lowercase: true, index: true },
    applicantName: { type: String },
    applicantNationalId: { type: String },
    targetIssuer: { type: mongoose.Schema.Types.ObjectId, ref: "Issuer", index: true },
    institution: { type: String }, // denormalised institution name
    qualification: { type: String },
    graduationYear: { type: Number },
    credentialType: { type: String, enum: ["secondary", "diploma", "degree", "masters", "phd", "other"], default: "other" },
    zqfLevel: { type: Number, min: 1, max: 10 },
    // Uploaded proof (scanned paper credential), pinned to IPFS.
    documentCid: { type: String },
    documentName: { type: String },
    documentMime: { type: String },
    // Regulatory case workflow (not a bare pending/approved/rejected):
    //  submitted         – received, awaiting screening
    //  screening         – completeness / identity checks in progress
    //  under_review      – records office verifying against institutional records
    //  awaiting_evidence – returned to the applicant for more evidence
    //  decision_pending  – verification done, awaiting the issuing decision
    //  issued            – credential issued + forwarded to ZAQA (terminal)
    //  rejected          – refused with reasons (terminal)
    //  withdrawn         – withdrawn by the applicant (terminal)
    status: {
      type: String,
      enum: ["submitted", "screening", "under_review", "awaiting_evidence", "decision_pending", "issued", "rejected", "withdrawn"],
      default: "submitted",
    },
    note: { type: String },
    credentialHash: { type: String }, // set once the institution issues the credential
    // full case timeline shown to the applicant — appended, never rewritten
    events: [eventEntry],
  },
  { timestamps: true }
);

// --- disputes: category-routed dispute cases (spec §11, §30) -----------------
// Each dispute is routed to the lead authority by category: ECZ results → ecz;
// institution compliance / programme accreditation → hea; ZQF level / national
// recognition → zaqa; graduate/award details → the issuing institution first.
const disputeSchema = new mongoose.Schema(
  {
    credentialHash: { type: String, index: true },
    category: {
      type: String,
      enum: ["ecz_result", "institution_compliance", "programme_accreditation", "zqf_level", "national_recognition", "award_details", "other"],
      required: true,
    },
    description: { type: String },
    openedByEmail: { type: String, lowercase: true, index: true },
    openedByRole: { type: String },
    leadAuthority: { type: String, enum: ["zaqa", "hea", "teveta", "ecz", "issuer"], index: true },
    targetIssuer: { type: mongoose.Schema.Types.ObjectId, ref: "Issuer", index: true },
    institution: { type: String },
    subjectName: { type: String },
    // Dispute / appeal workflow:
    //  open → under_review → awaiting_evidence → upheld | dismissed
    //  an upheld/dismissed decision may be appealed once: appealed → appeal_upheld | appeal_dismissed
    //  "resolved" is kept for legacy records (pre-workflow closures).
    status: {
      type: String,
      enum: ["open", "under_review", "awaiting_evidence", "upheld", "dismissed", "resolved", "appealed", "appeal_upheld", "appeal_dismissed"],
      default: "open",
    },
    resolution: { type: String },
    decidedBy: { type: String },
    decidedAt: { type: Date },
    appeal: {
      reason: { type: String },
      openedAt: { type: Date },
      openedBy: { type: String },
      decidedBy: { type: String },
      decidedAt: { type: Date },
      resolution: { type: String },
    },
    // complete case timeline — history is appended, never rewritten
    events: [eventEntry],
  },
  { timestamps: true }
);

// --- notifications: in-app notices to users (spec §14) ----------------------
const notificationSchema = new mongoose.Schema(
  {
    userEmail: { type: String, lowercase: true, index: true },
    message: { type: String },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// --- activity_logs: accountability trail — who created/modified what --------
const activityLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorEmail: { type: String, index: true },
    actorRole: { type: String },
    action: { type: String, index: true }, // e.g. "credential.issue", "zaqa.validate"
    entity: { type: String },              // "credential" | "institution" | "programme"
    entityId: { type: String, index: true },
    summary: { type: String },             // human-readable line (no technical identifiers)
  },
  { timestamps: true }
);

// --- recognition cases: RPL / CATS / progression / foreign / micro-credential ---
// Dedicated recognition workflows (distinct from credential digitisation):
//  rpl                   – Recognition of Prior Learning (lead: TEVETA)
//  credit_transfer       – CATS / credit accumulation & transfer (lead: ZAQA)
//  progression           – learner progression-route determination (lead: ZAQA)
//  foreign_qualification – evaluation of a foreign qualification against the NQF (lead: ZAQA)
//  micro_credential      – recognition/stacking of a micro-credential (lead: ZAQA)
const recognitionCaseSchema = new mongoose.Schema(
  {
    caseRef: { type: String, unique: true, sparse: true }, // e.g. RPL-2026-0001
    type: {
      type: String,
      enum: ["rpl", "credit_transfer", "progression", "foreign_qualification", "micro_credential"],
      required: true,
      index: true,
    },
    applicantEmail: { type: String, lowercase: true, index: true },
    applicantName: { type: String },
    applicantNationalId: { type: String },
    // What recognition is sought against (national register entry when known).
    targetQualification: { type: mongoose.Schema.Types.ObjectId, ref: "RegisteredQualification" },
    targetQualificationRef: { type: String }, // e.g. ZAQA-Q-2026-0001
    targetTitle: { type: String },
    targetNqfLevel: { type: Number, min: 1, max: 10 },
    // Source side (prior learning, foreign award, credits, micro-credential).
    sourceDescription: { type: String },
    sourceCountry: { type: String },          // foreign_qualification
    sourceInstitution: { type: String },
    // Evidence documents pinned to IPFS.
    evidence: [{ cid: String, name: String, mime: String, description: String, addedAt: Date, addedBy: String }],
    leadAuthority: { type: String, enum: ["zaqa", "hea", "teveta", "ecz"], index: true },
    // submitted → screening → assessment → decision_pending →
    //   recognised | partially_recognised | not_recognised | withdrawn
    status: {
      type: String,
      enum: ["submitted", "screening", "assessment", "decision_pending", "recognised", "partially_recognised", "not_recognised", "withdrawn"],
      default: "submitted",
      index: true,
    },
    // Explainable decision: rule applied, evidence considered, result, officer, policy version.
    decision: {
      outcome: String,           // recognised | partially_recognised | not_recognised
      nqfLevel: Number,          // level the learning was mapped to
      creditsAwarded: Number,
      mappedQualificationRef: String,
      rationale: String,         // rule + evidence + result narrative
      descriptorAnalysis: Object, // knowledge / skills / autonomyResponsibility comparison
      officer: String,
      policyVersion: String,     // NQF framework version applied
      at: Date,
    },
    // full case timeline — appended, never rewritten
    events: [eventEntry],
  },
  { timestamps: true }
);

// --- verification_logs: audit trail (no PII) -------------------------------
const verificationLogSchema = new mongoose.Schema(
  {
    credentialHash: { type: String, index: true },
    result: { type: String },
    mode: { type: String, enum: ["online", "offline"] },
    latencyMs: { type: Number },
  },
  { timestamps: true }
);

// NQF knowledge base (framework versions, levels, sub-frameworks, national register, policies).
export * from "./nqf.models.js";
// Billing: invoices & quotations, payments, receipts (manual fee workflow).
export * from "./billing.models.js";

export const User = mongoose.model("User", userSchema);
export const Issuer = mongoose.model("Issuer", issuerSchema);
export const CredentialIndex = mongoose.model("CredentialIndex", credentialIndexSchema);
export const Programme = mongoose.model("Programme", programmeSchema);
export const Application = mongoose.model("Application", applicationSchema);
export const Dispute = mongoose.model("Dispute", disputeSchema);
export const RecognitionCase = mongoose.model("RecognitionCase", recognitionCaseSchema);
export const Notification = mongoose.model("Notification", notificationSchema);
export const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
export const VerificationLog = mongoose.model("VerificationLog", verificationLogSchema);
