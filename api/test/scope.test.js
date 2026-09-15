import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScope, checkProgrammeCycle } from "../src/services/scope.service.js";

const scope = (o) => ({ regulator: "HEA", allowedTypes: [], validFrom: "2015-01-01", ...o });

test("no scope entries → not applicable, passes", () => {
  const r = checkScope({ accreditationScopes: [] }, { credentialType: "degree", zqfLevel: 7, graduationYear: 2020 });
  assert.equal(r.ok, true); assert.equal(r.applicable, false);
});

test("diploma-only college issuing a degree is outside scope", () => {
  const issuer = { accreditationScopes: [scope({ allowedTypes: ["diploma", "other"], maxZqfLevel: 6 })] };
  assert.equal(checkScope(issuer, { credentialType: "diploma", zqfLevel: 6, graduationYear: 2020 }).ok, true);
  const r = checkScope(issuer, { credentialType: "degree", zqfLevel: 7, graduationYear: 2020 });
  assert.equal(r.ok, false); assert.equal(r.regulator, "HEA"); assert.match(r.detail, /degrees/);
});

test("award dated before the institution was eligible fails on period", () => {
  const issuer = { accreditationScopes: [scope({ validFrom: "2018-06-01" })] };
  assert.equal(checkScope(issuer, { credentialType: "degree", zqfLevel: 7, graduationYear: 2017 }).ok, false);
  assert.equal(checkScope(issuer, { credentialType: "degree", zqfLevel: 7, graduationYear: 2018 }).ok, true, "partial year counts");
});

test("scope that ended before the award year fails; a later entry restores it", () => {
  const issuer = { accreditationScopes: [
    scope({ validFrom: "2010-01-01", validTo: "2015-12-31" }),
    scope({ validFrom: "2019-01-01" }),
  ] };
  assert.equal(checkScope(issuer, { credentialType: "degree", zqfLevel: 7, graduationYear: 2017 }).ok, false);
  assert.equal(checkScope(issuer, { credentialType: "degree", zqfLevel: 7, graduationYear: 2021 }).ok, true);
});

test("every authority's scope must permit the award", () => {
  const issuer = { accreditationScopes: [
    scope({ regulator: "HEA" }),                                          // HEA: anything
    scope({ regulator: "ZAQA", allowedTypes: ["diploma"] }),              // ZAQA: diplomas only
  ] };
  assert.equal(checkScope(issuer, { credentialType: "degree", zqfLevel: 7, graduationYear: 2020 }).regulator, "ZAQA");
  assert.equal(checkScope(issuer, { credentialType: "diploma", zqfLevel: 6, graduationYear: 2020 }).ok, true);
});

test("ZQF ceiling applies only when the credential level is known", () => {
  const issuer = { accreditationScopes: [scope({ maxZqfLevel: 6 })] };
  assert.equal(checkScope(issuer, { credentialType: "degree", zqfLevel: 7, graduationYear: 2020 }).ok, false);
  assert.equal(checkScope(issuer, { credentialType: "degree", zqfLevel: null, graduationYear: 2020 }).ok, true);
});

test("programme cycles: covering cycle passes, gap fails, no register is not applicable", () => {
  const prog = { name: "Diploma in ICT", inceptionYear: 2016, cycles: [
    { label: "2016–2018", startYear: 2016, endYear: 2018 }, { label: "2021 onward", startYear: 2021, endYear: null },
  ] };
  assert.equal(checkProgrammeCycle(prog, 2017).ok, true);
  assert.equal(checkProgrammeCycle(prog, 2023).ok, true);
  assert.equal(checkProgrammeCycle(prog, 2019).ok, false);
  assert.equal(checkProgrammeCycle(prog, 2014).ok, false, "before inception");
  assert.equal(checkProgrammeCycle({ name: "X", cycles: [] }, 2019).applicable, false);
  assert.equal(checkProgrammeCycle(null, 2019).applicable, false);
});

test("named programmes in a scope entry restrict the qualification", () => {
  const issuer = { accreditationScopes: [scope({ programmes: ["Diploma in ICT", "Diploma in Accountancy"] })] };
  assert.equal(checkScope(issuer, { credentialType: "diploma", zqfLevel: 6, graduationYear: 2020, qualification: "diploma in ict" }).ok, true);
  assert.equal(checkScope(issuer, { credentialType: "diploma", zqfLevel: 6, graduationYear: 2020, qualification: "Diploma in Nursing" }).ok, false);
});

test("authorisation must cover the study start year as well as the award year", () => {
  const issuer = { accreditationScopes: [scope({ validFrom: "2019-01-01" })] };
  assert.equal(checkScope(issuer, { credentialType: "degree", zqfLevel: 7, graduationYear: 2021, studyStartYear: 2017 }).ok, false);
  assert.match(checkScope(issuer, { credentialType: "degree", zqfLevel: 7, graduationYear: 2021, studyStartYear: 2017 }).detail, /when studies began/);
  assert.equal(checkScope(issuer, { credentialType: "degree", zqfLevel: 7, graduationYear: 2022, studyStartYear: 2019 }).ok, true);
});

test("cycle register: suspended cycle, level mismatch and study-period gap all fail", () => {
  const prog = { name: "Diploma in ICT", cycles: [
    { startYear: 2016, endYear: 2018, zqfLevel: 6 },
    { startYear: 2019, endYear: 2019, status: "suspended" },
    { startYear: 2020, endYear: null, zqfLevel: 6 },
  ] };
  assert.equal(checkProgrammeCycle(prog, 2019).ok, false, "suspended");
  assert.equal(checkProgrammeCycle(prog, 2021, { zqfLevel: 7 }).ok, false, "level mismatch");
  assert.equal(checkProgrammeCycle(prog, 2021, { zqfLevel: 6 }).ok, true);
  assert.equal(checkProgrammeCycle(prog, 2021, { studyStartYear: 2019 }).ok, false, "suspended when studies began");
  assert.equal(checkProgrammeCycle(prog, 2022, { studyStartYear: 2020 }).ok, true);
});
