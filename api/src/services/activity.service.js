// Accountability trail: records which user created or modified what. Best-effort — logging must
// never break the underlying operation, so failures are swallowed.
import { ActivityLog } from "../models/index.js";

export async function logActivity(req, { action, entity, entityId, summary }) {
  try {
    await ActivityLog.create({
      actorId: req.user?.sub,
      actorEmail: req.user?.email,
      actorRole: req.user?.role,
      action, entity, entityId, summary,
    });
  } catch {
    /* non-fatal */
  }
}
