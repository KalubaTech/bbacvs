import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseNationalId, maskNationalId } from "../src/utils/nationalId.js";

test("normaliseNationalId canonicalises spacing and case, and drops blanks", () => {
  assert.equal(normaliseNationalId(" 123456/78/1 "), "123456/78/1");
  assert.equal(normaliseNationalId("123456 / 78 / 1"), "123456/78/1");
  assert.equal(normaliseNationalId("zn1234567"), "ZN1234567");
  assert.equal(normaliseNationalId(""), undefined);
  assert.equal(normaliseNationalId("   "), undefined);
  assert.equal(normaliseNationalId(null), undefined);
  assert.equal(normaliseNationalId(undefined), undefined);
});

test("maskNationalId hides the NRC serial but keeps district and check digit", () => {
  assert.equal(maskNationalId("123456/78/1"), "••••••/78/1");
  assert.equal(maskNationalId(" 123456 / 78 / 1 "), "••••••/78/1");
});

test("maskNationalId never leaks the full identifier for other formats", () => {
  const masked = maskNationalId("ZN1234567");
  assert.equal(masked, "•••••••67");
  assert.ok(!masked.includes("ZN12345"));
  assert.equal(maskNationalId("A1"), "A1"); // nothing meaningful left to hide
});

test("maskNationalId returns null when no identifier is on record", () => {
  assert.equal(maskNationalId(undefined), null);
  assert.equal(maskNationalId(""), null);
});
