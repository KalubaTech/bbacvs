// Builds the regulator accreditation certificate with a digitally signed QR (spec §4 stages 6–8).
// Shared by the HEA/TEVETA portal downloads and the institution's own download. The authority
// identity on the certificate follows the issuer's sector (HEA for higher-ed, TEVETA for TEVET).
import { config } from "../config/index.js";
import { buildSignedPayload, renderQR } from "./signedQr.service.js";
import { buildAccreditationCertificatePDF, ACCREDITING_AUTHORITIES } from "./pdf.service.js";

export function accreditingAuthorityFor(issuer) {
  return issuer.sector === "tevet" ? ACCREDITING_AUTHORITIES.TEVETA : ACCREDITING_AUTHORITIES.HEA;
}

export async function buildAccreditationCertificate(issuer) {
  const authority = accreditingAuthorityFor(issuer);
  const ref = `${authority.abbr}/${new Date(issuer.createdAt).getFullYear()}/${String(issuer._id).slice(-6).toUpperCase()}`;
  // Authority key (governance signer 2), falling back to the ZAQA key in dev setups.
  const key = config.governance.signer2 || config.zaqa.signingKey;
  let qrDataUrl = null;
  if (key) {
    const signed = buildSignedPayload(
      { cred_did: issuer.did, cid: ref, hash8: String(issuer._id).slice(-8), iss_pk_ref: `did:${authority.abbr.toLowerCase()}#keys-1`, iat: Math.floor(Date.now() / 1000) },
      key
    );
    qrDataUrl = await renderQR({ ...signed, typ: `${authority.abbr.toLowerCase()}-accreditation` });
  }
  return buildAccreditationCertificatePDF({
    institution: issuer.institution,
    approvedDate: new Date(issuer.updatedAt || issuer.createdAt).toLocaleDateString("en-GB"),
    programs: issuer.accreditedPrograms || [],
    ref,
    qrDataUrl,
    authority,
  });
}
