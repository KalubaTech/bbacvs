// Accountability trail — who created or modified what. Readable by any governance seat.
import { Router } from "express";
import { requireAuth, requireRole, GOVERNANCE_ROLES } from "../middleware/auth.js";
import { ActivityLog } from "../models/index.js";

const router = Router();

// GET /api/activity — recent activity, most recent first. Optional ?prefix= to filter by action.
router.get("/", requireAuth, requireRole(...GOVERNANCE_ROLES), async (req, res, next) => {
  try {
    const q = {};
    if (req.query.prefix) q.action = { $regex: `^${String(req.query.prefix).replace(/[^a-z._]/gi, "")}` };
    const rows = await ActivityLog.find(q).sort({ createdAt: -1 }).limit(200).lean();
    res.json({
      activity: rows.map((r) => ({
        actor: r.actorEmail, role: r.actorRole, action: r.action,
        summary: r.summary, at: r.createdAt,
      })),
    });
  } catch (err) { next(err); }
});

export default router;
