// Automated qualification-validation engine (spec §6). Runs deterministic, explainable checks
// when a credential is submitted to ZAQA and again when a ZAQA officer clicks Validate.
// It RECOMMENDS a decision but never replaces authorised ZAQA judgement — except that a
// CRITICAL failure blocks one-click validation until the underlying issue is resolved.
import { Issuer, CredentialIndex } from "../models/index.js";
import { verifyOnChain } from "./web3.service.js";

const CRITICAL_RULES = ["Issuer registered", "Issuer authorised", "Blockchain anchor & signature"];

/**
 * Run all configured checks against a credential index record.
 * @returns {{checks: Array<{rule,pass,detail}>, risk, recommendation, ranAt}}
 */
export async function runValidationChecks(cred) {
  const checks = [];
  const add = (rule, pass, detail) => checks.push({ rule, pass: !!pass, detail });

  // Step 1 — verify the issuer.
  const issuer = await Issuer.findById(cred.issuer).lean();
  add("Issuer registered", !!issuer, issuer ? issuer.institution : "issuer record not found");
  const regStatus = issuer?.heaStatus || "approved";
  const regulator = issuer?.sector === "secondary" ? "ECZ" : "HEA";
  add(`${regulator} status active`, !!issuer && regStatus === "approved", `status: ${regStatus}`);
  add("Issuer authorised", !!issuer?.onChain, issuer?.onChain ? "authorised in the national registry" : "not authorised");

  // Step 2 — verify the programme / award authority (higher-ed only).
  if (issuer && issuer.sector !== "secondary") {
    const progs = issuer.accreditedPrograms || [];
    const match = progs.some((p) => p.toLowerCase() === (cred.qualification || "").toLowerCase());
    add(
      "Programme accredited",
      progs.length === 0 || match,
      progs.length === 0
        ? "no programme register recorded — requires officer confirmation"
        : match ? cred.qualification : `"${cred.qualification}" is not in the accredited-programme register`
    );
  }

  // Step 3 — qualification rules.
  add("ZQF level assigned", cred.zqfLevel != null, cred.zqfLevel != null ? `Level ${cred.zqfLevel}` : "no ZQF level recorded");
  add("Qualification title present", !!cred.qualification, cred.qualification || "missing");
  add("Award year present", !!cred.graduationYear, cred.graduationYear ? String(cred.graduationYear) : "missing");

  // Duplicate detection: same holder + qualification + year + institution, different record.
  const or = [];
  if (cred.holderEmail) or.push({ holderEmail: cred.holderEmail });
  if (cred.holderDID) or.push({ holderDID: cred.holderDID });
  let dup = null;
  if (or.length) {
    dup = await CredentialIndex.findOne({
      _id: { $ne: cred._id },
      qualification: cred.qualification,
      graduationYear: cred.graduationYear,
      institution: cred.institution,
      status: { $ne: "revoked" },
      $or: or,
    }).lean();
  }
  add("Duplicate check", !dup, dup ? "another credential with the same holder, qualification, year and institution exists" : "no duplicate found");

  // Signature / anchor: the on-chain anchor commits to the signed VC hash.
  let anchored = false;
  try { anchored = (await verifyOnChain(cred.credentialHash)).status === "VERIFIED"; } catch { /* chain unreachable */ }
  add("Blockchain anchor & signature", anchored, anchored ? "anchor verified against the registry" : "anchor not confirmed");

  // Step 4 — risk classification.
  const failed = checks.filter((c) => !c.pass);
  let risk = "low";
  if (failed.some((c) => CRITICAL_RULES.includes(c.rule)) || regStatus === "suspended") risk = "critical";
  else if (failed.some((c) => c.rule === "Duplicate check")) risk = "high";
  else if (failed.length > 0) risk = "medium";

  const recommendation =
    risk === "low" ? "Approve" :
    risk === "medium" ? "Review — confirm the flagged items before approval" :
    risk === "high" ? "Investigate the duplicate before validation" :
    "Do not validate — a critical requirement failed";

  return { checks, risk, recommendation, ranAt: new Date() };
}

/** True when the report contains a failure that must block one-click validation. */
export function hasCriticalFailure(report) {
  return report?.risk === "critical";
}
