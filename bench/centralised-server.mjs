// Centralised baseline verifier for objective 3 (D11). It performs the SAME verifier task as
// BBACVS GET /api/verify/:id — look up the record, check the issuer's signature and the record
// digest, run the same governance look-ups (programme accreditation, accreditation scope,
// programme cycle), apply the same status policy and write the same audit row — but trusts
// its own database instead of a blockchain anchor and IPFS. The difference in latency and
// throughput between the two is therefore the cost of decentralised trust.
//
// Env: MONGODB_URI, PORT, RATE_LIMIT_PER_MIN (match BBACVS for a fair comparison).
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { CredentialIndex, Issuer, Programme, VerificationLog } from "../api/src/models/index.js";
import { verifyCredential } from "../api/src/services/vc.service.js";
import { credentialDigest, LEGACY_HASH_VERSION } from "../api/src/services/crypto.service.js";
import { checkScope, findProgramme, checkProgrammeCycle } from "../api/src/services/scope.service.js";
import { resolveVerificationStatus } from "../api/src/services/verificationStatus.service.js";

// The full signed credential lives in the central database (equivalent record size).
export const CentralisedRecord = mongoose.models.CentralisedRecord || mongoose.model("CentralisedRecord", new mongoose.Schema({
  credentialHash: { type: String, required: true, unique: true },
  signedVC: { type: Object, required: true },
}));

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function createBaselineApp() {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: "256kb" }));
  app.use(rateLimit({ windowMs: 60 * 1000, max: Number(process.env.RATE_LIMIT_PER_MIN) || 100, standardHeaders: true, legacyHeaders: false }));

  app.get("/api/verify/:id", async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const credentialHash = req.params.id;
      if (!/^0x[a-fA-F0-9]{64}$/.test(credentialHash)) return res.status(400).json({ error: "Invalid credential hash" });
      const meta = await CredentialIndex.findOne({ credentialHash }).lean();
      const issuerRec = meta ? await Issuer.findById(meta.issuer).lean() : null;
      const record = meta ? await CentralisedRecord.findOne({ credentialHash }).lean() : null;

      let integrity = "not_checked";
      if (record && issuerRec) {
        const digestOk = credentialDigest(record.signedVC, meta.hashVersion || LEGACY_HASH_VERSION) === credentialHash;
        integrity = digestOk && verifyCredential(record.signedVC, issuerRec.publicKey) ? "verified" : "tampered";
      }
      const chain = !meta ? "NOT_FOUND" : meta.status === "revoked" ? "REVOKED" : "VERIFIED";
      const { displayStatus, credentialStatus } = resolveVerificationStatus({ chain, integrity, meta });

      let programmeAccredited = null;
      if (meta?.issuer && (await Programme.countDocuments({ issuer: meta.issuer })) > 0) {
        programmeAccredited = !!(await Programme.exists({ issuer: meta.issuer, status: "approved", name: { $regex: `^${escapeRegex(meta.qualification)}$`, $options: "i" } }));
      }
      let scopeAtAward = null, programmeOfferedInYear = null;
      if (meta && issuerRec) {
        const scope = checkScope(issuerRec, { credentialType: meta.credentialType, zqfLevel: meta.zqfLevel, graduationYear: meta.graduationYear, studyStartYear: meta.studyStartYear, qualification: meta.qualification });
        if (scope.applicable) scopeAtAward = scope.ok;
        const cycle = checkProgrammeCycle(await findProgramme(meta.issuer, meta.qualification), meta.graduationYear, { studyStartYear: meta.studyStartYear, zqfLevel: meta.zqfLevel });
        if (cycle.applicable) programmeOfferedInYear = cycle.ok;
      }

      VerificationLog.create({ credentialHash, result: displayStatus, mode: "online", latencyMs: Date.now() - startedAt }).catch(() => {});
      res.json({
        status: chain, displayStatus, mode: "centralised",
        credential: meta ? { institution: meta.institution, subjectName: meta.subjectName, qualification: meta.qualification, graduationYear: meta.graduationYear } : null,
        summary: { credentialStatus, contentIntegrity: integrity, programmeAccredited, scopeAtAward, programmeOfferedInYear },
      });
    } catch (err) { next(err); }
  });
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await mongoose.connect(process.env.MONGODB_URI);
  const port = Number(process.env.PORT || 4101);
  createBaselineApp().listen(port, "127.0.0.1", () => console.log(`centralised baseline on 127.0.0.1:${port}`));
}
