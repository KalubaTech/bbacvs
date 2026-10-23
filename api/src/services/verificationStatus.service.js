// One verification policy for the headline result AND the plain-language summary (D05). Both are
// derived from the same resolved status, so they can never disagree. Rules are evaluated in
// order; the first that applies wins (most severe / least trustworthy first):
//
//   1. UNAVAILABLE            the blockchain could not be queried
//   2. NOT_FOUND              no anchor for this hash
//   3. REVOKED                revoked on-chain (a corrected replacement may exist)
//   4. TAMPERED               content-integrity check failed (CID, decryption, digest, signature, index)
//   5. UNKNOWN_ISSUER         anchoring issuer is no longer authorised on-chain
//   6. UNTRUSTED              no issuer key on record that belongs to the anchoring address
//   7. INTEGRITY_UNAVAILABLE  content could not be retrieved, so integrity is unproven
//   8. REVOKED                revoked in the application (on-chain revocation not yet recorded)
//   9. SUSPENDED              suspended by ZAQA/admin (credential status or ZAQA state)
//  10. REJECTED / UNDER_DISPUTE / SUSPICIOUS   ZAQA review outcomes
//  11. VERIFIED               ZAQA validated
//  12. PENDING_ZAQA_VALIDATION draft / pending / no ZAQA decision
export const STATUS_RULES = [
  { status: "UNAVAILABLE", when: ({ chain }) => chain === "UNAVAILABLE" },
  { status: "NOT_FOUND", when: ({ chain }) => chain === "NOT_FOUND" },
  { status: "REVOKED", when: ({ chain }) => chain === "REVOKED" },
  { status: "TAMPERED", when: ({ integrity }) => integrity === "tampered" },
  { status: "UNKNOWN_ISSUER", when: ({ chain }) => chain === "UNKNOWN_ISSUER" },
  { status: "UNTRUSTED", when: ({ integrity }) => integrity === "untrusted" },
  { status: "INTEGRITY_UNAVAILABLE", when: ({ integrity }) => integrity !== "verified" },
  { status: "REVOKED", when: ({ meta }) => meta?.status === "revoked" },
  { status: "SUSPENDED", when: ({ meta }) => meta?.status === "suspended" || meta?.zaqaValidation === "suspended" },
  { status: "REJECTED", when: ({ meta }) => meta?.zaqaValidation === "rejected" },
  { status: "UNDER_DISPUTE", when: ({ meta }) => meta?.zaqaValidation === "under_dispute" },
  { status: "SUSPICIOUS", when: ({ meta }) => meta?.zaqaValidation === "suspicious" },
  { status: "VERIFIED", when: ({ meta }) => meta?.zaqaValidation === "validated" },
  { status: "PENDING_ZAQA_VALIDATION", when: () => true },
];

// Plain-language sentence for non-technical verifiers. No hashes, no jargon.
const PLAIN = {
  UNAVAILABLE: "Could not be checked right now — the blockchain is unreachable",
  NOT_FOUND: "Not found on the blockchain",
  REVOKED: "Revoked",
  TAMPERED: "Failed the integrity check — the record does not match what the institution signed",
  UNKNOWN_ISSUER: "Issued by an unrecognised institution",
  UNTRUSTED: "The institution's signing key could not be confirmed",
  INTEGRITY_UNAVAILABLE: "Could not be fully checked right now — the signed record is temporarily unavailable",
  SUSPENDED: "Suspended pending investigation",
  REJECTED: "Not recognised by ZAQA",
  UNDER_DISPUTE: "Under dispute",
  SUSPICIOUS: "Flagged for review",
  VERIFIED: "Valid",
  PENDING_ZAQA_VALIDATION: "Pending national validation",
  // QR-only outcome (POST /api/verify/qr): the presented QR's own signature failed.
  INVALID: "The QR code's signature is invalid — it was altered or not issued by this institution",
};

/** Plain-language sentence for a resolved status. */
export function plainStatus(displayStatus) {
  return PLAIN[displayStatus] || PLAIN.NOT_FOUND;
}

/**
 * @param {object} p
 * @param {string} p.chain      on-chain status: VERIFIED | REVOKED | NOT_FOUND | UNKNOWN_ISSUER | UNAVAILABLE
 * @param {string} [p.integrity] checkIntegrity status: verified | tampered | untrusted | unavailable
 * @param {object|null} [p.meta] CredentialIndex row (status, zaqaValidation, supersededBy)
 * @returns {{ displayStatus: string, credentialStatus: string, rule: number }}
 */
export function resolveVerificationStatus({ chain, integrity, meta }) {
  const rule = STATUS_RULES.findIndex((r) => r.when({ chain, integrity, meta }));
  const displayStatus = STATUS_RULES[rule].status;
  let credentialStatus = PLAIN[displayStatus];
  if (displayStatus === "REVOKED" && meta?.supersededBy) credentialStatus = "Revoked — replaced by a corrected credential";
  return { displayStatus, credentialStatus, rule: rule + 1 };
}
