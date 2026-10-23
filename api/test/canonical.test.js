// D04 — deterministic credential digests. The same record must hash identically whatever order
// its properties were inserted in; the legacy format demonstrably did not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalize } from "../src/utils/canonicalJson.js";
import { credentialDigest, LEGACY_HASH_VERSION, CURRENT_HASH_VERSION } from "../src/services/crypto.service.js";

const a = { type: ["VerifiableCredential"], issuer: { id: "did:ethr:0x1" }, credentialSubject: { name: "Mwila", qualification: "BSc", graduationYear: 2024 } };
const b = { credentialSubject: { graduationYear: 2024, qualification: "BSc", name: "Mwila" }, issuer: { id: "did:ethr:0x1" }, type: ["VerifiableCredential"] };

test("canonical digest (v2) is independent of property order", () => {
  assert.equal(credentialDigest(a, CURRENT_HASH_VERSION), credentialDigest(b, CURRENT_HASH_VERSION));
});

test("legacy digest (v1) depends on property order — the D04 defect, kept only for old records", () => {
  assert.notEqual(credentialDigest(a, LEGACY_HASH_VERSION), credentialDigest(b, LEGACY_HASH_VERSION));
});

test("v1 and v2 digests of the same record differ, so the version must be stored", () => {
  assert.notEqual(credentialDigest(a, LEGACY_HASH_VERSION), credentialDigest(a, CURRENT_HASH_VERSION));
  assert.throws(() => credentialDigest(a, 99), /Unknown credential hash version/);
});

test("canonicalize sorts keys recursively and keeps array order", () => {
  assert.equal(canonicalize({ b: 1, a: [3, { d: 1, c: 2 }] }), '{"a":[3,{"c":2,"d":1}],"b":1}');
});

test("canonicalize follows JCS for numbers, strings and absent values", () => {
  // U+2028 is emitted raw (not escaped), exactly as ES2019+ JSON.stringify and RFC 8785 do.
  assert.equal(canonicalize({ n: 1.0, e: 1e21, s: "é\u2028\"", u: undefined, z: null }), '{"e":1e+21,"n":1,"s":"é\u2028\\"","z":null}');
  assert.equal(canonicalize([undefined, true]), "[null,true]");
  assert.throws(() => canonicalize({ x: NaN }), /non-finite/);
});

test("canonicalize orders keys by UTF-16 code units", () => {
  assert.equal(canonicalize({ "é": 1, "z": 2, "A": 3, "€": 4 }), '{"A":3,"z":2,"é":1,"€":4}');
});

test("Date values canonicalize like JSON.stringify (ISO string)", () => {
  const d = new Date("2026-10-20T00:00:00Z");
  assert.equal(canonicalize({ d }), '{"d":"2026-10-20T00:00:00.000Z"}');
});
