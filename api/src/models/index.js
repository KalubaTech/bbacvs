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
    status: { type: String, enum: ["pending", "active", "revoked"], default: "active" },
    reasonCode: { type: Number, default: 0 },
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
    // Graduate-raised correction request (holder → issuer/regulator).
    correctionRequest: {
      status: { type: String, enum: ["none", "open", "resolved"], default: "none" },
      message: { type: String },
      requestedAt: { type: Date },
    },
    qrPayload: { type: Object },
    anchorTx: { type: String },
    issuedAt: { type: Date, default: Date.now },
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
    // submitted → institution reviews; issued → verified + forwarded to ZAQA; rejected.
    status: { type: String, enum: ["submitted", "issued", "rejected"], default: "submitted" },
    note: { type: String },
    credentialHash: { type: String }, // set once the institution issues the credential
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
    status: { type: String, enum: ["open", "resolved"], default: "open" },
    resolution: { type: String },
    // complete case timeline — history is appended, never rewritten
    events: [{ at: Date, actor: String, action: String, note: String }],
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
export const Notification = mongoose.model("Notification", notificationSchema);
export const ActivityLog = mongoose.model("ActivityLog", activityLogSchema);
export const VerificationLog = mongoose.model("VerificationLog", verificationLogSchema);
