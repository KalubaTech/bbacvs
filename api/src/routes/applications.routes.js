// Credential digitization workflow. A graduate applies to have an existing (paper) credential
// digitized, uploads proof, and picks the awarding institution. The institution is notified,
// reviews the proof, then verifies & forwards to ZAQA (issues the credential, auto-submitted
// for ZAQA validation). Once ZAQA validates, the signed certificate becomes available.
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES, ISSUING_ROLES } from "../middleware/auth.js";
import { Application, Issuer } from "../models/index.js";
import { decryptKey } from "../services/keystore.service.js";
import { anchorCredentialAs } from "../services/web3.service.js";
import { prepareCredential, indexCredential } from "../services/issuance.service.js";
import { pin, fetchByCid } from "../services/ipfs.service.js";
import { logActivity } from "../services/activity.service.js";
import { pushEvent, makeEvent } from "../services/history.service.js";
import { runValidationChecks } from "../services/validationEngine.service.js";
import { notifyEmail, notifyIssuerOfficers, notifyRole } from "../services/notify.service.js";
import { CredentialIndex } from "../models/index.js";

const router = Router();

function view(a) {
  return {
    id: a._id, applicantName: a.applicantName, applicantEmail: a.applicantEmail,
    institution: a.institution, qualification: a.qualification, graduationYear: a.graduationYear,
    credentialType: a.credentialType, zqfLevel: a.zqfLevel, status: a.status, note: a.note,
    hasDocument: !!a.documentCid, credentialHash: a.credentialHash, createdAt: a.createdAt,
    updatedAt: a.updatedAt, events: a.events || [], // full case timeline
  };
}

// Legal review-workflow transitions (issue happens via /verify-issue, withdrawal via /withdraw).
const TRANSITIONS = {
  submitted: ["screening", "under_review", "rejected"],
  screening: ["under_review", "awaiting_evidence", "rejected"],
  under_review: ["awaiting_evidence", "decision_pending", "rejected"],
  awaiting_evidence: ["under_review", "rejected"],
  decision_pending: ["rejected"],
};
const TERMINAL_STATUSES = ["issued", "rejected", "withdrawn"];
// Statuses from which the institution may verify & issue.
const ISSUABLE_FROM = ["submitted", "screening", "under_review", "decision_pending"];

// POST /api/applications (graduate) — apply to digitize a credential + upload proof.
const applySchema = Joi.object({
  targetIssuerId: Joi.string().required(),
  qualification: Joi.string().min(2).max(160).required(),
  graduationYear: Joi.number().integer().min(1960).max(2100).required(),
  credentialType: Joi.string().valid("secondary", "diploma", "degree", "masters", "phd", "other").default("other"),
  zqfLevel: Joi.number().integer().min(1).max(10).optional(),
  nationalId: Joi.string().max(40).allow("").optional(),
  document: Joi.object({
    name: Joi.string().max(200).required(),
    mime: Joi.string().max(100).required(),
    data: Joi.string().base64().max(8_000_000).required(),
  }).required(),
});
router.post("/", requireAuth, requireRole(ROLES.HOLDER), validate(applySchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.body.targetIssuerId).lean();
    if (!issuer) return res.status(404).json({ error: "Institution not found" });

    // --- Search before application (spec §5, §13): reuse existing records first. ---
    const qualRx = new RegExp(`^${req.body.qualification.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const existing = await CredentialIndex.findOne({
      holderEmail: req.user.email?.toLowerCase(),
      qualification: qualRx,
      graduationYear: req.body.graduationYear,
      issuer: issuer._id,
      status: { $ne: "revoked" },
    }).lean();
    if (existing) {
      // Case A: exact validated match — link, don't create another application.
      if (existing.zaqaValidation === "validated") {
        await logActivity(req, { action: "application.reuse", entity: "credential", entityId: existing.credentialHash, summary: `Linked ${req.user.name || req.user.email} to an existing validated ${existing.qualification}` });
        return res.json({
          existing: "validated",
          credentialHash: existing.credentialHash,
          message: "A validated credential matching your details already exists. Your request has been linked to the existing record — see it under “My credentials”.",
        });
      }
      // Case B: record exists but validation is still in progress — don't request it again.
      return res.json({
        existing: "in_progress",
        message: "A credential matching your details already exists and is awaiting validation. No new application is needed.",
      });
    }
    // Duplicate-application guard: one open application per credential.
    const dupApp = await Application.findOne({
      applicantEmail: req.user.email?.toLowerCase(), targetIssuer: issuer._id,
      qualification: qualRx, graduationYear: req.body.graduationYear, status: "submitted",
    }).lean();
    if (dupApp) return res.status(409).json({ error: "You already have a pending application for this credential." });

    const cid = await pin({ filename: req.body.document.name, mime: req.body.document.mime, data: req.body.document.data });
    const app = await Application.create({
      applicantId: req.user.sub, applicantEmail: req.user.email, applicantName: req.user.name,
      applicantNationalId: req.body.nationalId,
      targetIssuer: issuer._id, institution: issuer.institution,
      qualification: req.body.qualification, graduationYear: req.body.graduationYear,
      credentialType: req.body.credentialType, zqfLevel: req.body.zqfLevel,
      documentCid: cid, documentName: req.body.document.name, documentMime: req.body.document.mime,
      events: [makeEvent(req, "application.submitted", `Applied to digitize ${req.body.qualification} (${req.body.graduationYear})`)],
    });
    await logActivity(req, { action: "application.submit", entity: "application", entityId: String(app._id), summary: `Applied to digitize ${app.qualification} from ${app.institution}` });
    await notifyIssuerOfficers(issuer._id, `New digitization request: ${app.applicantName} — ${app.qualification} (${app.graduationYear}). Please review the uploaded document.`);
    res.status(201).json({ application: view(app) });
  } catch (err) { next(err); }
});

// GET /api/applications/mine (graduate) — my applications + status.
router.get("/mine", requireAuth, requireRole(ROLES.HOLDER), async (req, res, next) => {
  try {
    const rows = await Application.find({ applicantEmail: req.user.email?.toLowerCase() }).sort({ createdAt: -1 }).lean();
    res.json({ applications: rows.map(view) });
  } catch (err) { next(err); }
});

// GET /api/applications/incoming (institution) — applications addressed to this institution.
router.get("/incoming", requireAuth, requireRole(...ISSUING_ROLES), async (req, res, next) => {
  try {
    const rows = await Application.find({ targetIssuer: req.user.issuerId }).sort({ createdAt: -1 }).lean();
    res.json({ applications: rows.map(view) });
  } catch (err) { next(err); }
});

// GET /api/applications/:id/document (institution) — view the uploaded proof.
router.get("/:id/document", requireAuth, requireRole(...ISSUING_ROLES), async (req, res, next) => {
  try {
    const app = await Application.findOne({ _id: req.params.id, targetIssuer: req.user.issuerId }).lean();
    if (!app?.documentCid) return res.status(404).json({ error: "No document" });
    const doc = await fetchByCid(app.documentCid);
    res.setHeader("Content-Type", app.documentMime || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${app.documentName || "credential"}"`);
    res.send(Buffer.from(doc.data, "base64"));
  } catch (err) { next(err); }
});

// POST /api/applications/:id/verify-issue (institution) — verify the proof and issue the
// credential, forwarding it to ZAQA for validation (zaqaValidation = pending).
router.post("/:id/verify-issue", requireAuth, requireRole(...ISSUING_ROLES), async (req, res, next) => {
  try {
    const app = await Application.findOne({ _id: req.params.id, targetIssuer: req.user.issuerId });
    if (!app) return res.status(404).json({ error: "Application not found" });
    if (!ISSUABLE_FROM.includes(app.status)) {
      return res.status(409).json({ error: "invalid_transition", from: app.status, to: "issued" });
    }
    const issuer = await Issuer.findById(req.user.issuerId);
    if (!issuer) return res.status(403).json({ error: "Issuer profile not found" });
    if ((issuer.heaStatus || "approved") !== "approved") {
      return res.status(403).json({ error: "Your institution must be approved before issuing." });
    }
    if (issuer.signingMode !== "server") {
      return res.status(400).json({ error: "MetaMask-signing institutions can't issue digitization requests from here yet." });
    }
    const claims = { name: app.applicantName, nationalId: app.applicantNationalId, qualification: app.qualification, graduationYear: app.graduationYear };
    const meta = { zqfLevel: app.zqfLevel, credentialType: issuer.sector === "secondary" ? "secondary" : (app.credentialType || "other") };
    const prep = await prepareCredential(issuer, app.applicantEmail, claims);
    const anchor = await anchorCredentialAs(decryptKey(issuer.encPrivateKey), prep.credentialHash, prep.cidHash);
    const cred = await indexCredential(issuer, app.applicantEmail, claims, prep, { status: "active", anchorTx: anchor.txHash, meta });
    // Institution has verified — forward straight to ZAQA for validation, with the
    // automated decision pack attached (§6).
    cred.zaqaValidation = "pending";
    cred.validationReport = await runValidationChecks(cred);
    pushEvent(cred, req, "credential.issued", `Issued from ${app.applicantName}'s digitization application`, { txHash: anchor.txHash });
    pushEvent(cred, req, "credential.submitted_to_zaqa", undefined, { from: "draft", to: "pending" });
    await cred.save();
    const from = app.status;
    app.status = "issued"; app.credentialHash = prep.credentialHash;
    pushEvent(app, req, "application.issued", "Credential issued and forwarded to ZAQA for validation", { from, to: "issued", credentialHash: prep.credentialHash });
    await app.save();
    await logActivity(req, { action: "application.verify_issue", entity: "application", entityId: String(app._id), summary: `Verified & forwarded ${app.applicantName}'s ${app.qualification} to ZAQA` });
    await notifyEmail(app.applicantEmail, `${app.institution} verified your ${app.qualification} and forwarded it to ZAQA for national validation.`);
    await notifyRole("zaqa", `New credential submitted for validation: ${app.applicantName} — ${app.qualification} (${app.institution}). Automated risk: ${cred.validationReport.risk}.`);
    res.status(201).json({ application: view(app) });
  } catch (err) { next(err); }
});

// POST /api/applications/:id/reject (institution)
const rejectSchema = Joi.object({ reason: Joi.string().max(300).allow("").optional() });
router.post("/:id/reject", requireAuth, requireRole(...ISSUING_ROLES), validate(rejectSchema), async (req, res, next) => {
  try {
    const app = await Application.findOne({ _id: req.params.id, targetIssuer: req.user.issuerId });
    if (!app) return res.status(404).json({ error: "Application not found" });
    if (TERMINAL_STATUSES.includes(app.status)) {
      return res.status(409).json({ error: "invalid_transition", from: app.status, to: "rejected" });
    }
    const from = app.status;
    app.status = "rejected"; app.note = req.body.reason || "";
    pushEvent(app, req, "application.rejected", app.note || undefined, { from, to: "rejected" });
    await app.save();
    await logActivity(req, { action: "application.reject", entity: "application", entityId: String(app._id), summary: `Rejected ${app.applicantName}'s digitization request` });
    await notifyEmail(app.applicantEmail, `${app.institution} could not verify your ${app.qualification} application${app.note ? `: ${app.note}` : "."}`);
    res.json({ application: view(app) });
  } catch (err) { next(err); }
});

// PATCH /api/applications/:id/status (institution) — move a case through the review workflow
// (screening / under_review / awaiting_evidence / decision_pending / rejected). The applicant
// is notified in plain language at every stage.
const STAGE_NOTICE = {
  screening: (a) => `${a.institution} has started screening your ${a.qualification} application (completeness and identity checks).`,
  under_review: (a) => `${a.institution} is now verifying your ${a.qualification} against institutional records.`,
  awaiting_evidence: (a) => `${a.institution} needs more evidence for your ${a.qualification} application${a.note ? `: ${a.note}` : "."} Please provide it from your applications page.`,
  decision_pending: (a) => `${a.institution} has finished verifying your ${a.qualification}; a final issuing decision is pending.`,
  rejected: (a) => `${a.institution} could not verify your ${a.qualification} application${a.note ? `: ${a.note}` : "."}`,
};
const statusSchema = Joi.object({
  status: Joi.string().valid("screening", "under_review", "awaiting_evidence", "decision_pending", "rejected").required(),
  note: Joi.string().max(500).allow("").optional(),
});
router.patch("/:id/status", requireAuth, requireRole(...ISSUING_ROLES), validate(statusSchema), async (req, res, next) => {
  try {
    const app = await Application.findOne({ _id: req.params.id, targetIssuer: req.user.issuerId });
    if (!app) return res.status(404).json({ error: "Application not found" });
    const from = app.status, to = req.body.status;
    if (!(TRANSITIONS[from] || []).includes(to)) {
      return res.status(409).json({ error: "invalid_transition", from, to });
    }
    app.status = to;
    if (req.body.note !== undefined) app.note = req.body.note;
    pushEvent(app, req, "application.status_changed", req.body.note || undefined, { from, to });
    await app.save();
    await logActivity(req, { action: "application.status_change", entity: "application", entityId: String(app._id), summary: `Moved ${app.applicantName}'s ${app.qualification} application from ${from} to ${to}` });
    await notifyEmail(app.applicantEmail, STAGE_NOTICE[to](app));
    res.json({ application: view(app) });
  } catch (err) { next(err); }
});

// POST /api/applications/:id/withdraw (graduate) — withdraw an application still in flight.
router.post("/:id/withdraw", requireAuth, requireRole(ROLES.HOLDER), async (req, res, next) => {
  try {
    const app = await Application.findOne({ _id: req.params.id, applicantEmail: req.user.email?.toLowerCase() });
    if (!app) return res.status(404).json({ error: "Application not found" });
    if (TERMINAL_STATUSES.includes(app.status)) {
      return res.status(409).json({ error: "invalid_transition", from: app.status, to: "withdrawn" });
    }
    const from = app.status;
    app.status = "withdrawn";
    pushEvent(app, req, "application.withdrawn", undefined, { from, to: "withdrawn" });
    await app.save();
    await logActivity(req, { action: "application.withdraw", entity: "application", entityId: String(app._id), summary: `Withdrew the ${app.qualification} digitization application` });
    res.json({ application: view(app) });
  } catch (err) { next(err); }
});

// POST /api/applications/:id/evidence (graduate) — answer an awaiting_evidence request: attach a
// replacement document (pinned to IPFS like the original upload) and/or a message, which sends
// the case back to under_review.
const evidenceSchema = Joi.object({
  documentBase64: Joi.string().base64().max(8_000_000).optional(),
  documentName: Joi.string().max(200).optional(),
  documentMime: Joi.string().max(100).optional(),
  message: Joi.string().min(1).max(1000).required(),
}).with("documentBase64", ["documentName", "documentMime"]);
router.post("/:id/evidence", requireAuth, requireRole(ROLES.HOLDER), validate(evidenceSchema), async (req, res, next) => {
  try {
    const app = await Application.findOne({ _id: req.params.id, applicantEmail: req.user.email?.toLowerCase() });
    if (!app) return res.status(404).json({ error: "Application not found" });
    if (app.status !== "awaiting_evidence") {
      return res.status(409).json({ error: "invalid_transition", from: app.status, to: "under_review" });
    }
    let cid;
    if (req.body.documentBase64) {
      cid = await pin({ filename: req.body.documentName, mime: req.body.documentMime, data: req.body.documentBase64 });
      app.documentCid = cid; app.documentName = req.body.documentName; app.documentMime = req.body.documentMime;
    }
    app.status = "under_review";
    pushEvent(app, req, "application.evidence_added", req.body.message, { from: "awaiting_evidence", to: "under_review", ...(cid ? { cid } : {}) });
    await app.save();
    await logActivity(req, { action: "application.evidence", entity: "application", entityId: String(app._id), summary: `Provided additional evidence for the ${app.qualification} application` });
    await notifyIssuerOfficers(app.targetIssuer, `${app.applicantName} provided additional evidence for their ${app.qualification} application: ${req.body.message}`);
    res.json({ application: view(app) });
  } catch (err) { next(err); }
});

export default router;
