// GovernanceSafe co-signing (D09). Lists issuer-authorisation proposals that await a second
// regulator, with each proposal's state read from the chain. Confirming happens in the
// co-signer's own wallet — this API never handles that key; it only re-checks the chain.
import { Router } from "express";
import { requireAuth, requireRole, ROLES } from "../middleware/auth.js";
import { Issuer } from "../models/index.js";
import { config } from "../config/index.js";
import { getSafeProposal, SAFE_OWNER_LABELS } from "../services/web3.service.js";
import { cosignMode, syncIssuerProposal, syncPendingProposals } from "../services/governance.service.js";

const router = Router();
const govOnly = [requireAuth, requireRole(ROLES.ZAQA, ROLES.HEA, ROLES.ECZ, ROLES.ADMIN)];

// GET /api/governance/config — custody mode and the Safe the co-signer must call.
router.get("/config", ...govOnly, (_req, res) => {
  res.json({
    mode: cosignMode(),
    governanceSafe: config.chain.governanceSafe,
    issuerRegistry: config.chain.issuerRegistry,
    chainId: 11155111,
    ownerLabels: SAFE_OWNER_LABELS,
  });
});

// GET /api/governance/proposals — open (and recently executed) issuer-authorisation proposals.
router.get("/proposals", ...govOnly, async (_req, res, next) => {
  try {
    await syncPendingProposals();
    const issuers = await Issuer.find({ "governanceProposal.safeTxId": { $exists: true } })
      .select("institution sector walletAddress did onChain governanceProposal").sort({ "governanceProposal.proposedAt": -1 }).limit(50).lean();
    const proposals = await Promise.all(issuers.map(async (i) => {
      let chain = null;
      try { chain = await getSafeProposal(i.governanceProposal.safeTxId); } catch { /* RPC unavailable */ }
      return {
        issuerId: i._id, institution: i.institution, sector: i.sector, walletAddress: i.walletAddress,
        onChain: !!i.onChain, ...i.governanceProposal, chain,
        // The on-chain call must grant THIS institution's address — flag any mismatch.
        callMatches: chain?.call ? chain.call.account.toLowerCase() === i.walletAddress.toLowerCase() : null,
      };
    }));
    res.json({ mode: cosignMode(), proposals });
  } catch (err) { next(err); }
});

// POST /api/governance/proposals/:safeTxId/sync — re-check one proposal after co-signing.
router.post("/proposals/:safeTxId/sync", ...govOnly, async (req, res, next) => {
  try {
    const issuer = await Issuer.findOne({ "governanceProposal.safeTxId": Number(req.params.safeTxId) });
    if (!issuer) return res.status(404).json({ error: "Proposal not found" });
    await syncIssuerProposal(issuer);
    res.json({ onChain: !!issuer.onChain, status: issuer.governanceProposal.status, chain: await getSafeProposal(issuer.governanceProposal.safeTxId) });
  } catch (err) { next(err); }
});

export default router;
