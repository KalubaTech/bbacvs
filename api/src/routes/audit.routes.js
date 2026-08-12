import { Router } from "express";
import { requireAuth, requireRole, GOVERNANCE_ROLES } from "../middleware/auth.js";
import { getIssuanceEvents } from "../services/web3.service.js";

const router = Router();

// GET /api/audit (Governance + JWT) — immutable on-chain event log (FR8).
// Readable by any national oversight seat (admin / ZAQA / HEA / ECZ).
// In production this reads from The Graph subgraph; here it queries events directly.
router.get("/", requireAuth, requireRole(...GOVERNANCE_ROLES), async (req, res, next) => {
  try {
    const fromBlock = parseInt(req.query.fromBlock || "0", 10);
    const events = await getIssuanceEvents(fromBlock);
    res.json({ count: events.length, events });
  } catch (err) {
    next(err);
  }
});

export default router;
