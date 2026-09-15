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
  const progs = scope.programmes?.length ? ` [${scope.programmes.length} named programme${scope.programmes.length === 1 ? "" : "s"}]` : "";
  const level = scope.maxZqfLevel != null ? ` up to ZQF ${scope.maxZqfLevel}` : "";
  const from = scope.validFrom ? new Date(scope.validFrom).getFullYear() : "?";
  const to = scope.validTo ? new Date(scope.validTo).getFullYear() : "open";
  return `${types}${level}${progs}, ${from}–${to}`;
}

/**
 * Check one award against the institution's regulator-set scopes.
 * Every regulator that has recorded scopes must have one in force for the award year that
 * permits the credential type and level.
 * @returns {{ ok: boolean, applicable: boolean, regulator?: string, detail: string }}
 */
export function checkScope(issuer, { credentialType, zqfLevel, graduationYear, studyStartYear, qualification }) {
  const scopes = issuer?.accreditationScopes || [];
  if (!scopes.length) return { ok: true, applicable: false, detail: "no scope restrictions recorded" };
  const award = Number(graduationYear);
  if (!Number.isFinite(award)) return { ok: true, applicable: false, detail: "award year unknown" };
  const start = Number(studyStartYear);
  // Years the authorisation must have covered: when studies began (if known) and when the award was made.
  const years = Number.isFinite(start) && start !== award ? [{ year: start, label: "when studies began" }, { year: award, label: "in the award year" }] : [{ year: award, label: "in the award year" }];
  const wanted = String(qualification || "").trim().toLowerCase();

  const byRegulator = {};
  for (const s of scopes) (byRegulator[s.regulator] ||= []).push(s);

  for (const [regulator, list] of Object.entries(byRegulator)) {
    for (const { year, label } of years) {
      const yStart = new Date(Date.UTC(year, 0, 1));
      const yEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
      const inForce = list.filter((s) => new Date(s.validFrom) <= yEnd && (!s.validTo || new Date(s.validTo) >= yStart));
      if (!inForce.length) {
        return { ok: false, applicable: true, regulator, detail: `${regulator}: the institution had no authorisation in force ${label} (${year})` };
      }
      const fits = inForce.some((s) =>
        (!s.allowedTypes?.length || s.allowedTypes.includes(credentialType)) &&
        (s.maxZqfLevel == null || zqfLevel == null || Number(zqfLevel) <= Number(s.maxZqfLevel)) &&
        (!s.programmes?.length || !wanted || s.programmes.some((p) => String(p).trim().toLowerCase() === wanted))
      );
      if (!fits) {
        const what = `${TYPE_LABEL[credentialType] || credentialType}${zqfLevel != null ? ` at ZQF ${zqfLevel}` : ""}${wanted ? ` for "${qualification}"` : ""}`;
        return { ok: false, applicable: true, regulator, detail: `${regulator}: ${what} was outside the authorised scope ${label} (${year}: ${inForce.map(describe).join("; ")})` };
      }
    }
  }
  return { ok: true, applicable: true, detail: years.length > 1 ? "authorised both when studies began and in the award year" : "within the authorised scope in the award year" };
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
export function checkProgrammeCycle(programme, graduationYear, { studyStartYear, zqfLevel } = {}) {
  if (!programme) return { ok: true, applicable: false, detail: "no programme record to check against" };
  const award = Number(graduationYear);
  const cycles = programme.cycles || [];
  if (programme.inceptionYear && award < programme.inceptionYear) {
    return { ok: false, applicable: true, detail: `${programme.name} only started in ${programme.inceptionYear}, after the ${award} award` };
  }
  if (!cycles.length) return { ok: true, applicable: false, detail: "no cycle register recorded for this programme yet" };
  const covering = (y) => cycles.filter((c) => Number(c.startYear) <= y && (c.endYear == null || Number(c.endYear) >= y));
  const ranges = () => cycles.map((c) => `${c.startYear}–${c.endYear ?? "ongoing"}${c.status && c.status !== "offered" ? ` (${c.status})` : ""}`).join(", ");
  const start = Number(studyStartYear);
  const years = Number.isFinite(start) && start !== award ? [{ y: start, label: "when studies began" }, { y: award, label: "in the award year" }] : [{ y: award, label: "in the award year" }];
  let matched = null;
  for (const { y, label } of years) {
    const hits = covering(y);
    if (!hits.length) return { ok: false, applicable: true, detail: `${programme.name} has no recorded cycle covering ${y} ${label} (recorded: ${ranges()})` };
    const running = hits.filter((c) => c.status !== "suspended" && c.status !== "discontinued");
    if (!running.length) return { ok: false, applicable: true, detail: `${programme.name} was ${hits[0].status} ${label} (${y})` };
    if (zqfLevel != null) {
      const levelOk = running.some((c) => c.zqfLevel == null || Number(c.zqfLevel) === Number(zqfLevel));
      if (!levelOk) return { ok: false, applicable: true, detail: `${programme.name} ran at ZQF ${running.map((c) => c.zqfLevel).join("/")} in ${y}, not ZQF ${zqfLevel}` };
    }
    matched = running[0];
  }
  return { ok: true, applicable: true, detail: `offered ${years.length > 1 ? "throughout the study period" : `in ${award}`} (${matched.label || `${matched.startYear}–${matched.endYear ?? "ongoing"}`}${matched.accreditationRef ? `, ref ${matched.accreditationRef}` : ""})` };
}

/**
 * Combined pre-issuance gate. Returns null when the award may proceed, otherwise
 * { status, error, code, detail } for the route to send.
 */
export async function eligibilityGate(issuer, { qualification, credentialType, zqfLevel, graduationYear, studyStartYear }) {
  const scope = checkScope(issuer, { credentialType, zqfLevel, graduationYear, studyStartYear, qualification });
  if (!scope.ok) {
    return { status: 403, code: "outside_accreditation_scope", error: `Not permitted: ${scope.detail}.` };
  }
  const programme = await findProgramme(issuer._id, qualification);
  const cycle = checkProgrammeCycle(programme, graduationYear, { studyStartYear, zqfLevel });
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
    programmes: (s.programmes || []).map((p) => String(p).trim()).filter(Boolean),
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
    scopes: mine.map((s) => ({ allowedTypes: s.allowedTypes, programmes: s.programmes, maxZqfLevel: s.maxZqfLevel, validFrom: s.validFrom, validTo: s.validTo })),
  });
  await issuer.save();
  return issuer;
}
