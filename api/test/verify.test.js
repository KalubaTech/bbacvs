import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, getJson } from "./helpers.js";

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

const INVALID_IDS = [
  ["plain text", "not-a-hash"],
  ["numeric id", "12345"],
  ["missing 0x prefix", "ab".repeat(32)],
  ["too short (31 bytes)", "0x" + "ab".repeat(31)],
  ["too long (33 bytes)", "0x" + "ab".repeat(33)],
  ["non-hex characters", "0x" + "zz".repeat(32)],
  ["upper-case prefix", "0X" + "ab".repeat(32)],
  ["path-traversal attempt", "..%2F..%2Fetc%2Fpasswd"],
  ["mongo operator injection", encodeURIComponent('{"$ne":null}')],
];

for (const [label, id] of INVALID_IDS) {
  test(`GET /api/verify/:id rejects an invalid credential id (${label}) with 400`, async () => {
    const { res, body } = await getJson(`${srv.baseUrl}/api/verify/${id}`);
    assert.equal(res.status, 400);
    assert.deepEqual(body, { error: "Invalid credential hash" });
  });
}

test("GET /api/verify/:hash/certificate rejects an invalid hash with 400", async () => {
  const { res, body } = await getJson(`${srv.baseUrl}/api/verify/not-a-hash/certificate`);
  assert.equal(res.status, 400);
  assert.deepEqual(body, { error: "Invalid credential hash" });
});

test("POST /api/verify/offline rejects a malformed QR payload with 400 + details", async () => {
  const { res, body } = await getJson(`${srv.baseUrl}/api/verify/offline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: { cid: "Qm..." } }), // missing sig, hash8, iat, issuerPubKey…
  });
  assert.equal(res.status, 400);
  assert.equal(body.error, "Validation failed");
  assert.ok(Array.isArray(body.details) && body.details.length > 0);
});

test("POST /api/verify/offline rejects a non-JSON / oversized body safely", async () => {
  const { res } = await getJson(`${srv.baseUrl}/api/verify/offline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ this is not json",
  });
  assert.equal(res.status, 400);
});

test("POST /api/verify/qr rejects a QR payload without a signature with 400", async () => {
  const { res, body } = await getJson(`${srv.baseUrl}/api/verify/qr`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: { hash: "0x" + "ab".repeat(32), iss_pk_ref: "did:ethr:0x1#keys-1" } }),
  });
  assert.equal(res.status, 400);
  assert.equal(body.error, "Validation failed");
});
