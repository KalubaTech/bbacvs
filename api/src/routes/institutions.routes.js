// Public self-service institution onboarding. A college/university/secondary school creates
// its own account and uploads its HEA accreditation certificate. The institution is stored
// PENDING (no on-chain authorisation yet) and enters the HEA (higher-ed) or ECZ (secondary)
// approval queue. Approval is what authorises it on-chain to issue credentials.
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { registerInstitution } from "../services/issuerRegistration.service.js";
import { pin } from "../services/ipfs.service.js";
import { notifyRole } from "../services/notify.service.js";
import { Issuer } from "../models/index.js";

const router = Router();

// GET /api/institutions (Public) — approved institutions graduates can apply to for digitization.
router.get("/", async (_req, res, next) => {
  try {
    const issuers = await Issuer.find({ onChain: true, heaStatus: { $ne: "suspended" } })
      .select("institution sector").sort({ institution: 1 }).lean();
    res.json({ institutions: issuers.map((i) => ({ id: i._id, institution: i.institution, sector: i.sector })) });
  } catch (err) { next(err); }
});

// POST /api/institutions/register (Public) — self-register + upload accreditation certificate.
// Colleges/universities are reviewed by the HEA; TEVET (technical/vocational) institutions by
// TEVETA. Secondary certification is handled directly by the ECZ, so secondary schools do not
// self-register here.
const registerSchema = Joi.object({
  institution: Joi.string().min(2).max(120).required(),
  sector: Joi.string().valid("higher_ed", "tevet").default("higher_ed"),
  officerName: Joi.string().max(120).required(),
  officerEmail: Joi.string().email().required(),
  officerPassword: Joi.string().min(8).required(),
  metamaskAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional().allow(""),
  accreditation: Joi.object({
    name: Joi.string().max(200).required(),
    mime: Joi.string().max(100).required(),
    data: Joi.string().base64().max(8_000_000).required(), // base64 of the file (~<6MB file)
  }).required(),
});
router.post("/register", validate(registerSchema), async (req, res, next) => {
  try {
    const { institution, sector, officerName, officerEmail, officerPassword, metamaskAddress, accreditation } = req.body;

    // Pin the accreditation document to IPFS (content-addressed; reviewer fetches it via the API).
    const cid = await pin({ filename: accreditation.name, mime: accreditation.mime, data: accreditation.data });

    const { issuer, officer } = await registerInstitution({
      institution, sector, officerName, officerEmail, officerPassword, metamaskAddress,
      heaStatus: "pending",       // awaits regulator approval (HEA or TEVETA)
      authorizeOnChain: false,    // on-chain grant happens at approval, not now
      selfRegistered: true,
      accreditation: { cid, name: accreditation.name, mime: accreditation.mime },
    });

    const reviewedBy = sector === "tevet" ? "TEVETA" : "HEA";
    // Tell the reviewing regulator a new application is waiting (manual review — spec/feedback).
    await notifyRole(sector === "tevet" ? "teveta" : "hea",
      `New self-registered institution awaiting review: ${issuer.institution}.`);

    res.status(201).json({
      institution: issuer.institution,
      sector: issuer.sector,
      status: "pending",
      reviewedBy,
      officer: { email: officer.email, name: officer.name },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

export default router;
