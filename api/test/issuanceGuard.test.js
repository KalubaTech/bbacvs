// Pure parts of the duplicate-issuance guard (no database): identity matching by email AND
// national ID, and the in-flight lock that stops a double-clicked "Issue" from anchoring twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  holderIdentityClauses, issuanceLockKey, acquireIssuanceLock, describeDuplicate,
  LIVE_CREDENTIAL_STATUSES,
} from "../src/services/issuance.service.js";

test("holderIdentityClauses matches on email and on NRC so a changed email is still caught", () => {
  const or = holderIdentityClauses({ holderEmail: "Grad@Example.com", nationalId: "123456/78/1" });
  assert.deepEqual(or, [{ holderEmail: "grad@example.com" }, { holderNationalId: "123456/78/1" }]);
});

test("holderIdentityClauses omits blank identifiers", () => {
  assert.deepEqual(holderIdentityClauses({ holderEmail: "a@b.c", nationalId: "  " }), [{ holderEmail: "a@b.c" }]);
  assert.deepEqual(holderIdentityClauses({}), []);
});

test("suspended credentials still count as live for duplicate purposes; revoked do not", () => {
  assert.ok(LIVE_CREDENTIAL_STATUSES.includes("active"));
  assert.ok(LIVE_CREDENTIAL_STATUSES.includes("pending"));
  assert.ok(LIVE_CREDENTIAL_STATUSES.includes("suspended"));
  assert.ok(!LIVE_CREDENTIAL_STATUSES.includes("revoked"));
});

test("issuanceLockKey is stable across casing / whitespace differences in the same request", () => {
  const a = issuanceLockKey({ issuerId: "iss1", holderEmail: "Grad@Example.com", nationalId: "123456/78/1", qualification: "BSc Computer Science", graduationYear: 2024 });
  const b = issuanceLockKey({ issuerId: "iss1", holderEmail: "grad@example.com", nationalId: " 123456 / 78 / 1", qualification: "  bsc computer science ", graduationYear: 2024 });
  assert.equal(a, b);
  const c = issuanceLockKey({ issuerId: "iss1", holderEmail: "grad@example.com", nationalId: "123456/78/1", qualification: "BSc Computer Science", graduationYear: 2025 });
  assert.notEqual(a, c, "a different graduation year is a different credential");
});

test("acquireIssuanceLock rejects a concurrent identical issuance until the first releases", () => {
  const key = issuanceLockKey({ issuerId: "iss1", holderEmail: "g@x.zm", qualification: "Diploma", graduationYear: 2020 });
  const release = acquireIssuanceLock(key);
  assert.equal(typeof release, "function");
  assert.equal(acquireIssuanceLock(key), null, "double-click: second request must be refused");
  release();
  const again = acquireIssuanceLock(key);
  assert.equal(typeof again, "function", "lock is free again after release");
  again();
});

test("describeDuplicate reports which identifiers matched without leaking the NRC", () => {
  const dup = { credentialHash: "0xabc", status: "active", holderEmail: "g@x.zm", holderNationalId: "123456/78/1", createdAt: "2024-01-01" };
  const d = describeDuplicate(dup, { holderEmail: "G@X.ZM", nationalId: "123456/78/1" });
  assert.deepEqual(d.matchedOn, ["email", "nationalId"]);
  assert.equal(d.credentialHash, "0xabc");
  assert.equal(JSON.stringify(d).includes("123456/78/1"), false);
  assert.deepEqual(describeDuplicate(dup, { holderEmail: "other@x.zm", nationalId: "123456/78/1" }).matchedOn, ["nationalId"]);
});
