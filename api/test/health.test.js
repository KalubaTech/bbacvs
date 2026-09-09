import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, getJson } from "./helpers.js";

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

test("GET /health reports the API as healthy", async () => {
  const { res, body } = await getJson(`${srv.baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/json/);
  assert.deepEqual(body, { ok: true, service: "bbacvs-api" });
});

test("security headers are applied to every response (Helmet)", async () => {
  const { res } = await getJson(`${srv.baseUrl}/health`);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-powered-by"), null, "Express fingerprint must be hidden");
});

test("unknown routes return a JSON 404, never an HTML stack page", async () => {
  const { res, body } = await getJson(`${srv.baseUrl}/api/does-not-exist`);
  assert.equal(res.status, 404);
  assert.deepEqual(body, { error: "Not found" });
});
