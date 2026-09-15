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
