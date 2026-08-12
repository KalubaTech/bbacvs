// Role-scoped user management. Each authority admin manages users within their own authority;
// the super admin manages the authority admins. Institution officers and graduates are created
// through their own flows (self-registration), not here.
import { Router } from "express";
import Joi from "joi";
import { validate } from "../middleware/security.js";
import { requireAuth, requireRole, ROLES, GOVERNANCE_ROLES, hashPassword } from "../middleware/auth.js";
import { User } from "../models/index.js";
import { logActivity } from "../services/activity.service.js";

const router = Router();

// Which roles a given actor may create/manage.
function manageableRoles(actorRole) {
  if (actorRole === ROLES.ADMIN) return [ROLES.ADMIN, ROLES.ZAQA, ROLES.HEA, ROLES.TEVETA, ROLES.ECZ];
  if (actorRole === ROLES.ZAQA) return [ROLES.ZAQA];
  if (actorRole === ROLES.HEA) return [ROLES.HEA];
  if (actorRole === ROLES.TEVETA) return [ROLES.TEVETA];
  if (actorRole === ROLES.ECZ) return [ROLES.ECZ];
  return [];
}

const ROLE_LABEL = {
  admin: "Super administrator", zaqa: "ZAQA admin", hea: "HEA admin", teveta: "TEVETA admin", ecz: "ECZ admin",
};

// GET /api/users — users this actor manages.
router.get("/", requireAuth, requireRole(...GOVERNANCE_ROLES), async (req, res, next) => {
  try {
    const roles = manageableRoles(req.user.role);
    const rows = await User.find({ role: { $in: roles } }).select("email name role createdAt").sort({ createdAt: -1 }).lean();
    res.json({
      manageableRoles: roles,
      users: rows.map((u) => ({
        id: u._id, email: u.email, name: u.name, role: u.role,
        roleLabel: ROLE_LABEL[u.role] || u.role, createdAt: u.createdAt,
        self: String(u._id) === req.user.sub,
      })),
    });
  } catch (err) { next(err); }
});

// POST /api/users — create a user within the actor's authority.
const createSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().max(120).required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid("admin", "zaqa", "hea", "teveta", "ecz").required(),
});
router.post("/", requireAuth, requireRole(...GOVERNANCE_ROLES), validate(createSchema), async (req, res, next) => {
  try {
    const { email, name, password, role } = req.body;
    if (!manageableRoles(req.user.role).includes(role)) {
      return res.status(403).json({ error: "You cannot create users with that role." });
    }
    if (await User.findOne({ email: email.toLowerCase() })) {
      return res.status(409).json({ error: "Email already in use" });
    }
    const user = await User.create({ email, name, role, passwordHash: await hashPassword(password) });
    await logActivity(req, { action: "user.create", entity: "user", entityId: String(user._id), summary: `Added ${ROLE_LABEL[role] || role} ${email}` });
    res.status(201).json({ user: { id: user._id, email: user.email, name: user.name, role: user.role } });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id — remove a user within the actor's authority (not yourself).
router.delete("/:id", requireAuth, requireRole(...GOVERNANCE_ROLES), async (req, res, next) => {
  try {
    if (req.params.id === req.user.sub) return res.status(400).json({ error: "You cannot remove your own account." });
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!manageableRoles(req.user.role).includes(target.role)) {
      return res.status(403).json({ error: "You cannot manage that user." });
    }
    await target.deleteOne();
    await logActivity(req, { action: "user.remove", entity: "user", entityId: String(target._id), summary: `Removed ${target.role} ${target.email}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
