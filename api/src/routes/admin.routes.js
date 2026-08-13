// Governance/admin operations: register accredited institutions as on-chain issuers.
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES } from "../middleware/auth.js";
import { Issuer } from "../models/index.js";
import { registerInstitution } from "../services/issuerRegistration.service.js";
import { logActivity } from "../services/activity.service.js";
import { pushEvent } from "../services/history.service.js";

const router = Router();

// POST /api/admin/issuers — register a new accredited institution as an issuer.
// Generates a signing wallet, authorises it via 2-of-3 GovernanceSafe, stores it,
// and creates a login account for the institution's issuing officer.
const createIssuerSchema = Joi.object({
  institution: Joi.string().min(2).max(120).required(),
  officerEmail: Joi.string().email().required(),
  officerPassword: Joi.string().min(8).required(),
  officerName: Joi.string().max(120).required(),
  // If provided, the institution signs anchoring txs themselves in MetaMask (this address
  // gets ISSUER_ROLE). If omitted, the API anchors with a server-held key.
  metamaskAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/).optional().allow(""),
  // Which regulator oversees the institution (HEA / TEVETA / ECZ).
  sector: Joi.string().valid("higher_ed", "tevet", "secondary").default("higher_ed"),
});
router.post(
  "/issuers",
  requireAuth,
  requireRole(ROLES.ADMIN),
  validate(createIssuerSchema),
  async (req, res, next) => {
    try {
      const { institution, officerEmail, officerPassword, officerName, metamaskAddress, sector } = req.body;
      const { issuer, officer, registrationTx } = await registerInstitution({
        institution, officerEmail, officerPassword, officerName, metamaskAddress,
        sector, heaStatus: "approved",
      });
      issuer.approvedBy = "admin";
      pushEvent(issuer, req, "institution.registered", "Registered by platform admin");
      await issuer.save();
      await logActivity(req, { action: "admin.register_issuer", entity: "institution", entityId: String(issuer._id), summary: `Registered institution ${issuer.institution}` });

      res.status(201).json({
        issuer: {
          id: issuer._id, institution: issuer.institution, did: issuer.did, walletAddress: issuer.walletAddress,
          signingMode: issuer.signingMode, onChain: issuer.onChain, registrationTx,
        },
        officer: { email: officer.email, name: officer.name },
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  }
);

// GET /api/admin/issuers
router.get("/issuers", requireAuth, requireRole(ROLES.ADMIN), async (_req, res, next) => {
  try {
    const issuers = await Issuer.find().sort({ createdAt: -1 }).lean();
    res.json({
      issuers: issuers.map((i) => ({
        id: i._id, institution: i.institution, did: i.did,
        walletAddress: i.walletAddress, onChain: i.onChain,
        registrationTx: i.registrationTx, createdAt: i.createdAt,
      })),
    });
  } catch (err) { next(err); }
});

export default router;
