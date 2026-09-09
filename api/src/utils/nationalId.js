// National ID (NRC / passport) helpers shared by issuance, duplicate detection and public
// verification. Zambian NRCs take the form 123456/78/1 (serial / district / check digit).

/**
 * Canonical form used for storage and duplicate matching: trims, removes internal
 * whitespace and upper-cases (passport numbers). Returns undefined for blank input so an
 * empty NRC is never stored or matched.
 */
export function normaliseNationalId(id) {
  if (id == null) return undefined;
  const s = String(id).replace(/\s+/g, "").toUpperCase();
  return s.length ? s : undefined;
}

const ZAMBIAN_NRC = /^(\d{6})\/(\d{2})\/(\d)$/;

/**
 * Privacy mask for public surfaces (verification page, verification certificate). Never
 * exposes the full identifier:
 *   123456/78/1 -> ••••••/78/1   (serial masked; district + check digit kept so two people
 *                                 with the same name can still be told apart)
 *   ZN1234567   -> •••••••67     (fallback: only the last two characters survive)
 */
export function maskNationalId(id) {
  const s = normaliseNationalId(id);
  if (!s) return null;
  const nrc = s.match(ZAMBIAN_NRC);
  if (nrc) return `${"•".repeat(nrc[1].length)}/${nrc[2]}/${nrc[3]}`;
  return s.length <= 2 ? s : "•".repeat(Math.max(3, s.length - 2)) + s.slice(-2);
}
