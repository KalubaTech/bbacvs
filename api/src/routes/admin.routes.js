// Governance/admin operations: register accredited institutions as on-chain issuers.
import { Router } from "express";
import Joi from "joi";
import { ethers } from "ethers";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES, hashPassword } from "../middleware/auth.js";
import { User, Issuer } from "../models/index.js";
import { encryptKey } from "../services/keystore.service.js";
import { publicKeyFor } from "../services/signedQr.service.js";
import { registerIssuerOnChain } from "../services/web3.service.js";

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
});
router.post(
  "/issuers",
  requireAuth,
  requireRole(ROLES.ADMIN),
  validate(createIssuerSchema),
  async (req, res, next) => {
    try {
      const { institution, officerEmail, officerPassword, officerName, metamaskAddress } = req.body;
      if (await User.findOne({ email: officerEmail.toLowerCase() })) {
        return res.status(409).json({ error: "Officer email already in use" });
      }

      const metamask = !!metamaskAddress;
      // The Crypto Engine key (server-held) signs the VC + QR proof in both modes.
      const signingKey = ethers.Wallet.createRandom();
      // The on-chain issuer identity: the institution's MetaMask account (they sign the
      // anchoring tx), or the server key (server anchors) in server mode.
      const onchainAddress = metamask ? ethers.getAddress(metamaskAddress) : signingKey.address;
      const did = `did:ethr:${onchainAddress}`;

      if (metamask && (await Issuer.findOne({ walletAddress: onchainAddress }))) {
        return res.status(409).json({ error: "That wallet address is already an issuer" });
      }

      // Persist FIRST (onChain:false) so an on-chain failure never orphans funds and is retryable.
      const issuer = await Issuer.create({
        institution, did, walletAddress: onchainAddress,
        encPrivateKey: encryptKey(signingKey.privateKey),
        publicKey: publicKeyFor(signingKey.privateKey),
        signingMode: metamask ? "metamask" : "server",
        onChain: false,
      });
      await User.create({
        email: officerEmail, name: officerName, role: "issuer",
        passwordHash: await hashPassword(officerPassword), issuer: issuer._id,
      });

      // Authorise on-chain via 2-of-3 governance (also funds `onchainAddress` with gas so a
      // MetaMask issuer can pay for its own anchoring transactions).
      const onchain = await registerIssuerOnChain(onchainAddress, did, institution);
      issuer.onChain = onchain.authorised;
      issuer.registrationTx = onchain.txHash;
      await issuer.save();

      res.status(201).json({
        issuer: {
          id: issuer._id, institution, did, walletAddress: onchainAddress,
          signingMode: issuer.signingMode, onChain: issuer.onChain, registrationTx: onchain.txHash,
        },
        officer: { email: officerEmail, name: officerName },
      });
    } catch (err) { next(err); }
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
