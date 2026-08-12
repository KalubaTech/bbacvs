import { Router } from "express";
import Joi from "joi";
import { ethers } from "ethers";
import { validate } from "../middleware/security.js";
import {
  hashPassword, comparePassword, signAccessToken, signRefreshToken, requireAuth,
} from "../middleware/auth.js";
import { User, Issuer } from "../models/index.js";
import { logActivity } from "../services/activity.service.js";

const router = Router();

function tokenPayload(user) {
  return {
    sub: String(user._id),
    email: user.email,
    role: user.role,
    name: user.name,
    issuerId: user.issuer ? String(user.issuer) : undefined,
    holderDID: user.holderDID,
  };
}

// POST /api/auth/register — self-registration for graduates (holders).
// The holder DID is generated automatically and never surfaced to the user.
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().max(120).required(),
});
router.post("/register", validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    if (await User.findOne({ email: email.toLowerCase() })) {
      return res.status(409).json({ error: "Email already registered" });
    }
    const holderDID = `did:ethr:${ethers.Wallet.createRandom().address}`;
    const user = await User.create({
      email, name, holderDID, role: "holder", passwordHash: await hashPassword(password),
    });
    const payload = tokenPayload(user);
    res.status(201).json({ accessToken: signAccessToken(payload), user: payload });
  } catch (err) { next(err); }
});

// POST /api/auth/login
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});
router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const payload = tokenPayload(user);
    res.cookie("refresh_token", signRefreshToken(payload), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict",
    });
    res.json({ accessToken: signAccessToken(payload), user: payload });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => res.json({ user: req.user }));

// ---- profile / account management (all roles) ------------------------------

// GET /api/auth/profile — the signed-in user's account, fresh from the DB (not the token).
router.get("/profile", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub)
      .select("email name role issuer createdAt phone nationalId address").lean();
    if (!user) return res.status(404).json({ error: "Account not found" });
    let institution = null;
    if (user.issuer) {
      const i = await Issuer.findById(user.issuer)
        .select("institution sector heaStatus onChain contactEmail contactPhone physicalAddress website accreditedPrograms").lean();
      if (i) institution = {
        name: i.institution, sector: i.sector, status: i.heaStatus || "approved", onChain: i.onChain,
        contactEmail: i.contactEmail, contactPhone: i.contactPhone,
        physicalAddress: i.physicalAddress, website: i.website,
        accreditedPrograms: i.accreditedPrograms || [],
      };
    }
    res.json({
      profile: {
        email: user.email, name: user.name, role: user.role,
        phone: user.phone, nationalId: user.nationalId, address: user.address,
        memberSince: user.createdAt, institution,
      },
    });
  } catch (err) { next(err); }
});

// PATCH /api/auth/profile — update the display name and personal details. Email and role are
// fixed (identity + access are regulator-controlled); a fresh access token is returned so the
// UI updates.
const profileSchema = Joi.object({
  name: Joi.string().min(2).max(120).required(),
  phone: Joi.string().max(30).allow("").optional(),
  nationalId: Joi.string().max(40).allow("").optional(),
  address: Joi.string().max(300).allow("").optional(),
});
router.patch("/profile", requireAuth, validate(profileSchema), async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: "Account not found" });
    user.name = req.body.name;
    for (const f of ["phone", "nationalId", "address"]) {
      if (req.body[f] !== undefined) user[f] = req.body[f];
    }
    await user.save();
    const payload = tokenPayload(user);
    res.json({ accessToken: signAccessToken(payload), user: payload });
  } catch (err) { next(err); }
});

// PATCH /api/auth/institution-profile — an institution officer maintains the institution's
// public contact details. Accreditation status, sector and identity remain regulator-controlled.
const institutionProfileSchema = Joi.object({
  contactEmail: Joi.string().email().allow("").optional(),
  contactPhone: Joi.string().max(30).allow("").optional(),
  physicalAddress: Joi.string().max(300).allow("").optional(),
  website: Joi.string().uri({ scheme: ["http", "https"] }).allow("").optional(),
});
router.patch("/institution-profile", requireAuth, validate(institutionProfileSchema), async (req, res, next) => {
  try {
    if (req.user.role !== "issuer" && req.user.role !== "ecz") {
      return res.status(403).json({ error: "Only institution accounts have an institution profile." });
    }
    const issuer = await Issuer.findById(req.user.issuerId);
    if (!issuer) return res.status(404).json({ error: "Institution profile not found" });
    for (const f of ["contactEmail", "contactPhone", "physicalAddress", "website"]) {
      if (req.body[f] !== undefined) issuer[f] = req.body[f];
    }
    await issuer.save();
    await logActivity(req, { action: "account.institution-profile", entity: "institution", entityId: String(issuer._id), summary: `Updated institution contact profile for ${issuer.institution}` });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/auth/change-password — verify the current password, set a new one.
const passwordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});
router.post("/change-password", requireAuth, validate(passwordSchema), async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ error: "Account not found" });
    if (!(await comparePassword(req.body.currentPassword, user.passwordHash))) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    user.passwordHash = await hashPassword(req.body.newPassword);
    await user.save();
    await logActivity(req, { action: "account.password", entity: "user", entityId: String(user._id), summary: "Changed account password" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
