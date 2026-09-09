// Abuse protection: the global limiter (100 requests / minute / client IP) must throttle a
// client that exceeds its quota and must key on the real client address behind the proxy.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, getJson } from "./helpers.js";

const LIMIT = 100;
let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

test("the 101st request within a minute is rejected with 429 and standard RateLimit headers", async () => {
  let last;
  for (let i = 0; i < LIMIT; i++) {
    last = await getJson(`${srv.baseUrl}/health`);
    assert.equal(last.res.status, 200, `request ${i + 1} should still be allowed`);
  }
  assert.equal(last.res.headers.get("ratelimit-limit"), String(LIMIT));
  assert.equal(last.res.headers.get("ratelimit-remaining"), "0");

  const { res, body } = await getJson(`${srv.baseUrl}/health`);
  assert.equal(res.status, 429);
  assert.deepEqual(body, { error: "Too many requests, slow down." });
  assert.ok(Number(res.headers.get("retry-after")) > 0, "Retry-After must tell the client when to come back");
});

test("the limit also protects the public verification endpoint", async () => {
  // Same client (already over quota from the previous test) — verification is throttled too.
  const { res } = await getJson(`${srv.baseUrl}/api/verify/not-a-hash`);
  assert.equal(res.status, 429);
});

test("quota is tracked per client IP (X-Forwarded-For from the trusted proxy hop)", async () => {
  const other = { headers: { "x-forwarded-for": "203.0.113.9" } };
  const { res } = await getJson(`${srv.baseUrl}/health`, other);
  assert.equal(res.status, 200, "a different client must not be punished for another's abuse");
  assert.equal(res.headers.get("ratelimit-remaining"), String(LIMIT - 1));
});
