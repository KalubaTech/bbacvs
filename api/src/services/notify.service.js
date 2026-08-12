// In-app notifications (spec §14). Best-effort: notification failures never break the
// underlying operation.
import { Notification, User } from "../models/index.js";

export async function notifyEmail(email, message) {
  try { if (email) await Notification.create({ userEmail: email, message }); } catch { /* non-fatal */ }
}

/** Notify every officer account linked to an institution. */
export async function notifyIssuerOfficers(issuerId, message) {
  try {
    const users = await User.find({ issuer: issuerId }).select("email").lean();
    await Promise.all(users.map((u) => Notification.create({ userEmail: u.email, message })));
  } catch { /* non-fatal */ }
}

/** Notify every user holding a role (e.g. all ZAQA officers). */
export async function notifyRole(role, message) {
  try {
    const users = await User.find({ role }).select("email").lean();
    await Promise.all(users.map((u) => Notification.create({ userEmail: u.email, message })));
  } catch { /* non-fatal */ }
}
