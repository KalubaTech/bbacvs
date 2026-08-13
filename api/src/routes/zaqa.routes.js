// ZAQA — top governance layer (National Qualifications Framework / ZQF).
// ZAQA does NOT issue certificates. It maintains the national trusted-issuer registry,
// validates ZQF levels, provides final national validation of credentials, and oversees
// disputes/appeals. Read access to the immutable on-chain audit trail lives in audit.routes.
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES } from "../middleware/auth.js";
import { Issuer, CredentialIndex, User, NQFVersion } from "../models/index.js";
import { decryptKey } from "../services/keystore.service.js";
import { revokeCredentialAs } from "../services/web3.service.js";
import { logActivity } from "../services/activity.service.js";
import { pushEvent } from "../services/history.service.js";
import { runValidationChecks, hasCriticalFailure } from "../services/validationEngine.service.js";
import { notifyEmail, notifyIssuerOfficers } from "../services/notify.service.js";

const router = Router();
const zaqaOnly = [requireAuth, requireRole(ROLES.ZAQA, ROLES.ADMIN)];

/** Code of the NQF framework version currently in force (decisions are stamped with it). */
async function activeFrameworkCode() {
  try {
    return (await NQFVersion.findOne({ status: "active" }).select("code").lean())?.code;
  } catch { return undefined; }
}

/** Compact, explainable evidence list from a validation report: "pass|fail: <rule>". */
function reportEvidence(report) {
  return (report?.checks || []).map((c) => `${c.pass ? "pass" : "fail"}: ${c.rule}`);
}

// GET /api/zaqa/overview — national oversight: every account by role + institution/credential
// tallies. ZAQA sits at the top of the governance stack, so it can see all the other roles.
router.get("/overview", ...zaqaOnly, async (_req, res, next) => {
  try {
    const [users, issuers, credCount, validatedCount] = await Promise.all([
      User.find().select("email name role createdAt").sort({ createdAt: -1 }).lean(),
      Issuer.find().select("institution sector heaStatus onChain zaqaTrusted").lean(),
      CredentialIndex.countDocuments({ status: { $ne: "pending" } }),
      CredentialIndex.countDocuments({ zaqaValidation: "validated" }),
    ]);
    const byRole = {};
    for (const u of users) byRole[u.role] = (byRole[u.role] || 0) + 1;
    // NOTE: no account list here — individual emails are PII and are managed per-authority
    // via /api/users (each admin only sees their own team). Oversight gets counts only.
    res.json({
      roleCounts: byRole,
      totals: {
        institutions: issuers.length,
        higherEd: issuers.filter((i) => i.sector !== "secondary" && i.sector !== "tevet").length,
        tevet: issuers.filter((i) => i.sector === "tevet").length,
        secondary: issuers.filter((i) => i.sector === "secondary").length,
        credentials: credCount,
        validated: validatedCount,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/zaqa/registry — national trusted-issuer registry (every issuer + trust/HEA status).
router.get("/registry", ...zaqaOnly, async (_req, res, next) => {
  try {
    const issuers = await Issuer.find().sort({ createdAt: -1 }).lean();
    res.json({
      issuers: issuers.map((i) => ({
        id: i._id, institution: i.institution, did: i.did, walletAddress: i.walletAddress,
        sector: i.sector, heaStatus: i.heaStatus || "approved", onChain: i.onChain,
        zaqaTrusted: !!i.zaqaTrusted, zaqaNote: i.zaqaNote, createdAt: i.createdAt,
        events: i.events || [],
      })),
    });
  } catch (err) { next(err); }
});

// PATCH /api/zaqa/registry/:id — mark an issuer trusted / not-trusted in the national registry.
const trustSchema = Joi.object({
  zaqaTrusted: Joi.boolean().required(),
  note: Joi.string().max(300).allow("").optional(),
});
router.patch("/registry/:id", ...zaqaOnly, validate(trustSchema), async (req, res, next) => {
  try {
    const issuer = await Issuer.findById(req.params.id);
    if (!issuer) return res.status(404).json({ error: "Issuer not found" });
    const from = !!issuer.zaqaTrusted;
    issuer.zaqaTrusted = req.body.zaqaTrusted;
    issuer.zaqaNote = req.body.note || "";
    pushEvent(issuer, req, "institution.zaqa_trust_changed", req.body.note || undefined, {
      from, to: !!req.body.zaqaTrusted, officer: req.user.email,
    });
    await issuer.save();
    await logActivity(req, {
      action: "zaqa.trust_change", entity: "institution", entityId: String(issuer._id),
      summary: `Set ${issuer.institution} to ${req.body.zaqaTrusted ? "trusted" : "not trusted"} in the national registry`,
    });
    res.json({ id: issuer._id, zaqaTrusted: issuer.zaqaTrusted, zaqaNote: issuer.zaqaNote });
  } catch (err) { next(err); }
});

// GET /api/zaqa/validation — credentials awaiting / holding final national validation.
router.get("/validation", ...zaqaOnly, async (req, res, next) => {
  try {
    // Default view excludes drafts (not yet submitted to ZAQA).
    // ?status= filters the ZAQA validation state; ?credStatus= filters the
    // credential lifecycle state (active/suspended/revoked) for the
    // suspension/revocation case workspaces.
    const q = req.query.status ? { zaqaValidation: req.query.status } : { zaqaValidation: { $ne: "draft" } };
    if (req.query.credStatus) {
      delete q.zaqaValidation;
      q.status = req.query.credStatus;
      if (req.query.status) q.zaqaValidation = req.query.status;
    }
    const rows = await CredentialIndex.find(q).sort({ createdAt: -1 }).limit(200).lean();
    res.json({
      credentials: rows.map((r) => ({
        credentialHash: r.credentialHash, institution: r.institution, subjectName: r.subjectName,
        qualification: r.qualification, credentialType: r.credentialType, zqfLevel: r.zqfLevel,
        status: r.status, zaqaValidation: r.zaqaValidation, zaqaNote: r.zaqaNote, zaqaRef: r.zaqaRef,
        issuedAt: r.issuedAt,
        validationReport: r.validationReport, // decision pack: checks + risk + recommendation
        // lifecycle context for the case workspaces (suspensions/revocations/history)
        reasonCode: r.reasonCode,
        suspension: r.suspension,
        supersededBy: r.supersededBy,
        supersedes: r.supersedes,
        frameworkVersion: r.frameworkVersion,
        holderEmail: r.holderEmail,
        events: r.events || [],
      })),
    });
  } catch (err) { next(err); }
});

// PATCH /api/zaqa/validation/:hash — set final national validation status + confirm ZQF level.
const validateSchema = Joi.object({
  zaqaValidation: Joi.string()
    .valid("validated", "rejected", "pending", "suspicious", "suspended", "under_dispute")
    .required(),
  zqfLevel: Joi.number().integer().min(1).max(10).optional(),
  note: Joi.string().max(300).allow("").optional(),
});
router.patch("/validation/:hash", ...zaqaOnly, validate(validateSchema), async (req, res, next) => {
  try {
    const cred = await CredentialIndex.findOne({ credentialHash: req.params.hash });
    if (!cred) return res.status(404).json({ error: "Credential not found" });
    const decision = req.body.zaqaValidation;
    const from = cred.zaqaValidation;
    // Explainable decision (§6): every decision carries a decision pack. One-click validation is
    // a controlled transaction (§7) — re-run all checks; other decisions reuse the latest report
    // (running one only if none exists yet).
    let report = cred.validationReport;
    if (decision === "validated" || !report) {
      report = await runValidationChecks(cred);
      cred.validationReport = report;
    }
    if (decision === "validated" && hasCriticalFailure(report)) {
      cred.validationReports.push(report); // every validation run is preserved
      await cred.save(); // preserve the refreshed report for the officer
      const failedRules = report.checks.filter((c) => !c.pass).map((c) => c.rule).join("; ");
      await logActivity(req, { action: "zaqa.validation_blocked", entity: "credential", entityId: cred.credentialHash, summary: `Validation of ${cred.subjectName}'s ${cred.qualification} blocked — critical check failed: ${failedRules}` });
      return res.status(409).json({ error: `Cannot validate — critical check failed: ${failedRules}` });
    }
    cred.zaqaValidation = decision;
    if (req.body.zqfLevel != null) cred.zqfLevel = req.body.zqfLevel;
    cred.zaqaNote = req.body.note || "";
    // On first validation, mint a national reference number + stamp the validation date.
    if (decision === "validated") {
      const now = new Date();
      if (!cred.zaqaRef) {
        cred.zaqaRef = `ZAQA/${now.getFullYear()}/${cred.credentialHash.slice(2, 10).toUpperCase()}`;
      }
      cred.zaqaValidatedAt = now;
    }
    // Snapshot the decision pack (append — history is never rewritten) and stamp the NQF
    // framework version the decision was made under.
    cred.validationReports.push(report);
    const frameworkCode = await activeFrameworkCode();
    if (frameworkCode) cred.frameworkVersion = frameworkCode;
    pushEvent(cred, req, "credential.zaqa_decision", req.body.note || undefined, {
      from, to: decision,
      rule: report?.recommendation,
      evidence: reportEvidence(report),
      result: decision,
      policyVersion: frameworkCode,
      officer: req.user.email,
    });
    await cred.save();
    await logActivity(req, { action: `zaqa.${decision}`, entity: "credential", entityId: cred.credentialHash, summary: `Set ${cred.subjectName}'s ${cred.qualification} to ${decision}` });
    // Notify the graduate and the issuing institution of the decision (§7 stages 11–12, §14).
    const label = decision.replace(/_/g, " ");
    await notifyEmail(cred.holderEmail, `ZAQA decision on your ${cred.qualification}: ${label}${cred.zaqaRef ? ` (ref ${cred.zaqaRef})` : ""}.`);
    await notifyIssuerOfficers(cred.issuer, `ZAQA set ${cred.subjectName}'s ${cred.qualification} to ${label}.`);
    res.json({
      credentialHash: cred.credentialHash, zaqaValidation: cred.zaqaValidation,
      zqfLevel: cred.zqfLevel, zaqaNote: cred.zaqaNote,
      zaqaRef: cred.zaqaRef, zaqaValidatedAt: cred.zaqaValidatedAt,
      frameworkVersion: cred.frameworkVersion, validationReport: cred.validationReport,
    });
  } catch (err) { next(err); }
});

// POST /api/zaqa/validation/:hash/revoke — ZAQA revokes a credential ON-CHAIN (the anchor is
// revoked with the issuing institution's key, which the server custodies) so that every future
// verification immediately reflects REVOKED.
const revokeSchema = Joi.object({ reasonCode: Joi.number().integer().min(1).max(5).default(4) });
router.post("/validation/:hash/revoke", ...zaqaOnly, validate(revokeSchema), async (req, res, next) => {
  try {
    const cred = await CredentialIndex.findOne({ credentialHash: req.params.hash });
    if (!cred) return res.status(404).json({ error: "Credential not found" });
    const issuer = await Issuer.findById(cred.issuer);
    if (!issuer) return res.status(409).json({ error: "Issuing institution not found for on-chain revocation" });
    const tx = await revokeCredentialAs(decryptKey(issuer.encPrivateKey), cred.credentialHash, req.body.reasonCode);
    cred.status = "revoked";
    cred.reasonCode = req.body.reasonCode;
    pushEvent(cred, req, "credential.revoked", undefined, { reasonCode: req.body.reasonCode, officer: req.user.email });
    await cred.save();
    await logActivity(req, { action: "zaqa.revoke", entity: "credential", entityId: cred.credentialHash, summary: `Revoked ${cred.subjectName}'s ${cred.qualification} on-chain` });
    await notifyEmail(cred.holderEmail, `Your ${cred.qualification} has been revoked by ZAQA. Contact ZAQA for details.`);
    await notifyIssuerOfficers(cred.issuer, `ZAQA revoked ${cred.subjectName}'s ${cred.qualification}.`);
    res.json({ credentialHash: cred.credentialHash, status: "revoked", tx });
  } catch (err) { next(err); }
});

// POST /api/zaqa/validation/:hash/suspend — temporarily withdraw a credential pending
// investigation (off-chain state; on-chain the anchor stays VERIFIED until revoked).
const suspendSchema = Joi.object({ reason: Joi.string().min(3).max(500).required() });
router.post("/validation/:hash/suspend", ...zaqaOnly, validate(suspendSchema), async (req, res, next) => {
  try {
    const cred = await CredentialIndex.findOne({ credentialHash: req.params.hash });
    if (!cred) return res.status(404).json({ error: "Credential not found" });
    const from = cred.zaqaValidation;
    if (!["validated", "pending", "suspicious"].includes(from)) {
      return res.status(409).json({ error: `Cannot suspend a credential whose validation state is "${from}".` });
    }
    cred.zaqaValidation = "suspended";
    cred.status = "suspended";
    cred.suspension.reason = req.body.reason;
    cred.suspension.suspendedAt = new Date();
    cred.suspension.suspendedBy = req.user.email;
    cred.suspension.reinstatedAt = undefined;
    cred.suspension.reinstatedBy = undefined;
    pushEvent(cred, req, "credential.suspended", req.body.reason, { from, to: "suspended", officer: req.user.email });
    await cred.save();
    await logActivity(req, { action: "zaqa.suspend", entity: "credential", entityId: cred.credentialHash, summary: `Suspended ${cred.subjectName}'s ${cred.qualification} pending investigation` });
    await notifyEmail(cred.holderEmail, `Your ${cred.qualification} has been suspended by ZAQA pending investigation: ${req.body.reason}`);
    await notifyIssuerOfficers(cred.issuer, `ZAQA suspended ${cred.subjectName}'s ${cred.qualification}: ${req.body.reason}`);
    res.json({
      credentialHash: cred.credentialHash, zaqaValidation: cred.zaqaValidation,
      status: cred.status, suspension: cred.suspension,
    });
  } catch (err) { next(err); }
});

// POST /api/zaqa/validation/:hash/reinstate — lift a suspension. The credential returns to
// "validated" if it already holds a ZAQA reference, otherwise back to the validation queue.
const reinstateSchema = Joi.object({ note: Joi.string().max(500).allow("").optional() });
router.post("/validation/:hash/reinstate", ...zaqaOnly, validate(reinstateSchema), async (req, res, next) => {
  try {
    const cred = await CredentialIndex.findOne({ credentialHash: req.params.hash });
    if (!cred) return res.status(404).json({ error: "Credential not found" });
    if (cred.zaqaValidation !== "suspended") {
      return res.status(409).json({ error: `Cannot reinstate a credential whose validation state is "${cred.zaqaValidation}".` });
    }
    const to = cred.zaqaRef ? "validated" : "pending";
    cred.zaqaValidation = to;
    cred.status = "active";
    cred.suspension.reinstatedAt = new Date();
    cred.suspension.reinstatedBy = req.user.email;
    pushEvent(cred, req, "credential.reinstated", req.body.note || undefined, { from: "suspended", to, officer: req.user.email });
    await cred.save();
    await logActivity(req, { action: "zaqa.reinstate", entity: "credential", entityId: cred.credentialHash, summary: `Reinstated ${cred.subjectName}'s ${cred.qualification} (now ${to})` });
    await notifyEmail(cred.holderEmail, `Your ${cred.qualification} has been reinstated by ZAQA${to === "validated" ? " and remains nationally validated" : " and is back in the validation queue"}.`);
    await notifyIssuerOfficers(cred.issuer, `ZAQA reinstated ${cred.subjectName}'s ${cred.qualification} (now ${to}).`);
    res.json({
      credentialHash: cred.credentialHash, zaqaValidation: cred.zaqaValidation,
      status: cred.status, suspension: cred.suspension,
    });
  } catch (err) { next(err); }
});

// GET /api/zaqa/disputes — open correction requests / appeals raised by graduates.
router.get("/disputes", ...zaqaOnly, async (_req, res, next) => {
  try {
    const rows = await CredentialIndex.find({ "correctionRequest.status": "open" })
      .sort({ "correctionRequest.requestedAt": -1 }).limit(200).lean();
    res.json({
      disputes: rows.map((r) => ({
        credentialHash: r.credentialHash, institution: r.institution, subjectName: r.subjectName,
        qualification: r.qualification, message: r.correctionRequest?.message,
        requestedAt: r.correctionRequest?.requestedAt, status: r.status,
      })),
    });
  } catch (err) { next(err); }
});

// PATCH /api/zaqa/disputes/:hash — mark a dispute resolved.
router.patch("/disputes/:hash", ...zaqaOnly, async (req, res, next) => {
  try {
    const cred = await CredentialIndex.findOne({ credentialHash: req.params.hash });
    if (!cred) return res.status(404).json({ error: "Credential not found" });
    if (cred.correctionRequest) cred.correctionRequest.status = "resolved";
    pushEvent(cred, req, "credential.correction_resolved", cred.correctionRequest?.message, { officer: req.user.email });
    await cred.save();
    await logActivity(req, { action: "zaqa.correction_resolve", entity: "credential", entityId: cred.credentialHash, summary: `Resolved correction request on ${cred.subjectName}'s ${cred.qualification}` });
    res.json({ credentialHash: cred.credentialHash, correctionRequest: cred.correctionRequest });
  } catch (err) { next(err); }
});

export default router;
