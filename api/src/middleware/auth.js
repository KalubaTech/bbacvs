// JWT auth + bcrypt passwords + role-based access control (L7 / FR9).
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "../config/index.js";

export const ROLES = {
  ADMIN: "admin",     // super-user: platform administration, oversight of all portals
  ZAQA: "zaqa",       // ZAQA — national oversight, trusted registry, final validation (ZQF)
  HEA: "hea",         // HEA — higher-education regulator (register/approve/suspend HE institutions)
  TEVETA: "teveta",   // TEVETA — TEVET regulator (register/approve/suspend TEVET institutions)
  ECZ: "ecz",         // ECZ — secondary-school certification authority (issues Grade 12 / Form 4 & 6)
  ISSUER: "issuer",   // college / university academic credential issuer
  HOLDER: "holder",   // graduate / student
};

// Convenience groupings for requireRole(...).
// GOVERNANCE = anyone with a national oversight / regulator seat (audit trail, dashboards).
export const GOVERNANCE_ROLES = [ROLES.ADMIN, ROLES.ZAQA, ROLES.HEA, ROLES.TEVETA, ROLES.ECZ];
// ISSUING = anyone who anchors credentials on-chain (universities/colleges + ECZ for secondary).
export const ISSUING_ROLES = [ROLES.ISSUER, ROLES.ECZ];

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}
export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.accessTtl });
}
export function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.refreshTtl });
}

/** Require a valid JWT; attaches req.user = { sub, email, role, issuerId?, holderDID? }. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });
  try {
    req.user = jwt.verify(token, config.jwt.secret);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Require the authenticated user to hold one of `roles`. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }
    next();
  };
}
