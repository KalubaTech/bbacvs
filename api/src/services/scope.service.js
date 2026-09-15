// Accreditation scope + programme-cycle checks.
//
// Regulators (HEA / TEVETA / ZAQA) can restrict WHAT an institution may award and WHEN:
// each scope entry says "between validFrom and validTo this institution may award these
// credential types up to this ZQF level". A credential is checked against the scope that
// was in force in its AWARD year, so a diploma college issuing a degree, or a degree dated
// to a year before the institution was eligible, is caught at issuance and flagged as
// critical during ZAQA validation.
//
// Institutions also keep a cycle register per programme (every intake / academic cycle the
// programme ran, with its courses). When a programme has cycles recorded, an award year with
// no covering cycle is treated the same way.
import { Programme } from "../models/index.js";
import { pushEvent } from "./history.service.js";

export const CREDENTIAL_TYPES = ["secondary", "diploma", "degree", "masters", "phd", "other"];
export const SCOPE_REGULATORS = ["HEA", "TEVETA", "ECZ", "ZAQA"];

const TYPE_LABEL = { secondary: "secondary certificates", diploma: "diplomas", degree: "degrees", masters: "master's degrees", phd: "doctorates", other: "other certificates" };

function describe(scope) {
  const types = scope.allowedTypes?.length ? scope.allowedTypes.map((t) => TYPE_LABEL[t] || t).join(", ") : "all types";
  const level = scope.maxZqfLevel != null ? ` up to ZQF ${scope.maxZqfLevel}` : "";
  const from = scope.validFrom ? new Date(scope.validFrom).getFullYear() : "?";
  const to = scope.validTo ? new Date(scope.validTo).getFullYear() : "open";
  return `${types}${level}, ${from}–${to}`;
}

/**
 * Check one award against the institution's regulator-set scopes.
 * Every regulator that has recorded scopes must have one in force for the award year that
 * permits the credential type and level.
 * @returns {{ ok: boolean, applicable: boolean, regulator?: string, detail: string }}
 */
export function checkScope(issuer, { credentialType, zqfLevel, graduationYear }) {
  const scopes = issuer?.accreditationScopes || [];
  if (!scopes.length) return { ok: true, applicable: false, detail: "no scope restrictions recorded" };
  const year = Number(graduationYear);
  if (!Number.isFinite(year)) return { ok: true, applicable: false, detail: "award year unknown" };
  const yStart = new Date(Date.UTC(year, 0, 1));
  const yEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const byRegulator = {};
  for (const s of scopes) (byRegulator[s.regulator] ||= []).push(s);

  for (const [regulator, list] of Object.entries(byRegulator)) {
    const inForce = list.filter((s) => new Date(s.validFrom) <= yEnd && (!s.validTo || new Date(s.validTo) >= yStart));
    if (!inForce.length) {
      return { ok: false, applicable: true, regulator, detail: `${regulator}: the institution had no accreditation scope in force for the ${year} award year` };
    }
    const fits = inForce.some((s) =>
      (!s.allowedTypes?.length || s.allowedTypes.includes(credentialType)) &&
      (s.maxZqfLevel == null || zqfLevel == null || Number(zqfLevel) <= Number(s.maxZqfLevel))
    );
    if (!fits) {
      const what = `${TYPE_LABEL[credentialType] || credentialType}${zqfLevel != null ? ` at ZQF ${zqfLevel}` : ""}`;
      return { ok: false, applicable: true, regulator, detail: `${regulator}: ${what} is outside the scope accredited for ${year} (${inForce.map(describe).join("; ")})` };
    }
  }
  return { ok: true, applicable: true, detail: "within the accredited scope in force at award time" };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The institution's approved programme whose name matches the qualification, if any. */
export async function findProgramme(issuerId, qualification) {
  if (!issuerId || !qualification) return null;
  return Programme.findOne({
    issuer: issuerId, status: "approved",
    name: { $regex: `^${escapeRegex(String(qualification).trim())}$`, $options: "i" },
  }).lean();
}

/**
 * Was the programme actually running in the award year? Uses the programme's cycle register
 * (and inception year). Programmes without a register are not judged.
 * @returns {{ ok: boolean, applicable: boolean, detail: string }}
 */
export function checkProgrammeCycle(programme, graduationYear) {
  if (!programme) return { ok: true, applicable: false, detail: "no programme record to check against" };
  const year = Number(graduationYear);
  const cycles = programme.cycles || [];
  if (programme.inceptionYear && year < programme.inceptionYear) {
    return { ok: false, applicable: true, detail: `${programme.name} only started in ${programme.inceptionYear}, after the ${year} award` };
  }
  if (!cycles.length) return { ok: true, applicable: false, detail: "no cycle register recorded for this programme yet" };
  const hit = cycles.find((c) => Number(c.startYear) <= year && (c.endYear == null || Number(c.endYear) >= year));
  if (hit) return { ok: true, applicable: true, detail: `offered in ${year} (${hit.label || `${hit.startYear}–${hit.endYear ?? "ongoing"}`})` };
  const ranges = cycles.map((c) => `${c.startYear}–${c.endYear ?? "ongoing"}`).join(", ");
  return { ok: false, applicable: true, detail: `${programme.name} has no recorded cycle covering ${year} (recorded: ${ranges})` };
}

/**
 * Combined pre-issuance gate. Returns null when the award may proceed, otherwise
 * { status, error, code, detail } for the route to send.
 */
export async function eligibilityGate(issuer, { qualification, credentialType, zqfLevel, graduationYear }) {
  const scope = checkScope(issuer, { credentialType, zqfLevel, graduationYear });
  if (!scope.ok) {
    return { status: 403, code: "outside_accreditation_scope", error: `Not permitted: ${scope.detail}.` };
  }
  const programme = await findProgramme(issuer._id, qualification);
  const cycle = checkProgrammeCycle(programme, graduationYear);
  if (!cycle.ok) {
    return { status: 409, code: "programme_not_offered_in_year", error: `Not permitted: ${cycle.detail}.` };
  }
  return null;
}

/** Replace one regulator's scope entries on an institution (other regulators' entries kept). */
export async function setRegulatorScopes(issuer, regulator, scopes, req) {
  const others = (issuer.accreditationScopes || []).filter((s) => s.regulator !== regulator);
  const mine = scopes.map((s) => ({
    regulator,
    allowedTypes: s.allowedTypes || [],
    maxZqfLevel: s.maxZqfLevel ?? undefined,
    validFrom: s.validFrom,
    validTo: s.validTo || undefined,
    note: s.note || undefined,
    setBy: req.user.email,
    setAt: new Date(),
  }));
  issuer.accreditationScopes = [...others, ...mine];
  pushEvent(issuer, req, "institution.scope_updated", undefined, {
    regulator, count: mine.length, officer: req.user.email,
    scopes: mine.map((s) => ({ allowedTypes: s.allowedTypes, maxZqfLevel: s.maxZqfLevel, validFrom: s.validFrom, validTo: s.validTo })),
  });
  await issuer.save();
  return issuer;
}
