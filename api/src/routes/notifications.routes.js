// In-app notifications for the signed-in user (spec §14).
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { Notification } from "../models/index.js";

const router = Router();

// GET /api/notifications — my latest notifications + unread count.
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const email = req.user.email?.toLowerCase();
    const [rows, unread] = await Promise.all([
      Notification.find({ userEmail: email }).sort({ createdAt: -1 }).limit(30).lean(),
      Notification.countDocuments({ userEmail: email, read: false }),
    ]);
    res.json({
      unread,
      notifications: rows.map((n) => ({ id: n._id, message: n.message, read: n.read, at: n.createdAt })),
    });
  } catch (err) { next(err); }
});

// POST /api/notifications/read — mark all mine as read.
router.post("/read", requireAuth, async (req, res, next) => {
  try {
    await Notification.updateMany({ userEmail: req.user.email?.toLowerCase(), read: false }, { $set: { read: true } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
