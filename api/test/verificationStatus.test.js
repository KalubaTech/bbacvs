// D05 — one explicit precedence policy drives BOTH the headline status and the plain-language
// summary, so they can never disagree (the defect: an app-suspended credential showed a
// "Valid"/VERIFIED headline while the summary said "Suspended").
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveVerificationStatus, plainStatus, STATUS_RULES } from "../src/services/verificationStatus.service.js";

const ok = { chain: "VERIFIED", integrity: "verified" };
const r = (x) => resolveVerificationStatus(x);

test("app suspension of a ZAQA-validated credential: headline AND summary say suspended", () => {
  const res = r({ ...ok, meta: { status: "suspended", zaqaValidation: "validated" } });
  assert.equal(res.displayStatus, "SUSPENDED");
  assert.equal(res.credentialStatus, "Suspended pending investigation");
});

test("ZAQA-state suspension is also SUSPENDED", () => {
  assert.equal(r({ ...ok, meta: { status: "active", zaqaValidation: "suspended" } }).displayStatus, "SUSPENDED");
});

test("on-chain revocation outranks suspension, tampering and ZAQA state", () => {
  const res = r({ chain: "REVOKED", integrity: "tampered", meta: { status: "suspended", zaqaValidation: "validated" } });
  assert.equal(res.displayStatus, "REVOKED");
  assert.equal(r({ chain: "REVOKED", integrity: "verified", meta: { supersededBy: "0x1" } }).credentialStatus, "Revoked — replaced by a corrected credential");
});

test("app-level revocation not yet on-chain still reads REVOKED, not VERIFIED", () => {
  assert.equal(r({ ...ok, meta: { status: "revoked", zaqaValidation: "validated" } }).displayStatus, "REVOKED");
});

test("tampered content is never reported as verified, whatever ZAQA says", () => {
  const res = r({ chain: "VERIFIED", integrity: "tampered", meta: { status: "active", zaqaValidation: "validated" } });
  assert.equal(res.displayStatus, "TAMPERED");
  assert.equal(res.credentialStatus, plainStatus("TAMPERED"));
});

test("content that could not be retrieved is INTEGRITY_UNAVAILABLE, not verified", () => {
  assert.equal(r({ chain: "VERIFIED", integrity: "unavailable", meta: { zaqaValidation: "validated" } }).displayStatus, "INTEGRITY_UNAVAILABLE");
  assert.equal(r({ chain: "VERIFIED", integrity: undefined, meta: { zaqaValidation: "validated" } }).displayStatus, "INTEGRITY_UNAVAILABLE");
});

test("unknown issuer and untrusted key are distinct outcomes", () => {
  assert.equal(r({ chain: "UNKNOWN_ISSUER", integrity: "verified", meta: { zaqaValidation: "validated" } }).displayStatus, "UNKNOWN_ISSUER");
  assert.equal(r({ chain: "VERIFIED", integrity: "untrusted", meta: { zaqaValidation: "validated" } }).displayStatus, "UNTRUSTED");
});

test("registry unreachable and not found are reported as such", () => {
  assert.equal(r({ chain: "UNAVAILABLE", meta: null }).displayStatus, "UNAVAILABLE");
  assert.equal(r({ chain: "NOT_FOUND", meta: null }).displayStatus, "NOT_FOUND");
});

test("ZAQA states map one-to-one once integrity and standing are good", () => {
  const z = (zaqaValidation) => r({ ...ok, meta: { status: "active", zaqaValidation } }).displayStatus;
  assert.equal(z("validated"), "VERIFIED");
  assert.equal(z("pending"), "PENDING_ZAQA_VALIDATION");
  assert.equal(z("draft"), "PENDING_ZAQA_VALIDATION");
  assert.equal(z("rejected"), "REJECTED");
  assert.equal(z("under_dispute"), "UNDER_DISPUTE");
  assert.equal(z("suspicious"), "SUSPICIOUS");
});

test("suspension outranks a pending ZAQA state (ZAQA pending + app suspension)", () => {
  assert.equal(r({ ...ok, meta: { status: "suspended", zaqaValidation: "pending" } }).displayStatus, "SUSPENDED");
});

test("every status the policy can return has a plain-language sentence", () => {
  for (const { status } of STATUS_RULES) assert.ok(plainStatus(status).length > 3, status);
  assert.equal(plainStatus("VERIFIED"), "Valid");
});
