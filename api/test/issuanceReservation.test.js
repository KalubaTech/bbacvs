// D08 — the duplicate-issuance reservation is database-backed, so it holds across separate API
// processes. Several child processes race to reserve the same issuance; exactly one may win.
// Needs a reachable MongoDB (MONGODB_TEST_URI, default local) and uses a throwaway database.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

const BASE = process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017";
const DB_URI = `${BASE.replace(/\/$/, "")}/bbacvs_test_reservation_${process.pid}`;
const SERVICE = fileURLToPath(new URL("../src/services/issuance.service.js", import.meta.url));
const MODELS = fileURLToPath(new URL("../src/models/index.js", import.meta.url));

let reachable = true;
before(async () => {
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 1500 });
    const { IssuanceReservation } = await import(MODELS);
    await IssuanceReservation.init(); // build the unique + TTL indexes before racing
  } catch { reachable = false; }
});
after(async () => {
  if (reachable) await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
});

// One competing "API process": connect, wait for the start signal, try to reserve, report.
const CHILD = `
  const mongoose = (await import("mongoose")).default;
  const { acquireIssuanceLock } = await import(${JSON.stringify(SERVICE)});
  await mongoose.connect(${JSON.stringify(DB_URI)});
  const startAt = Number(process.argv[1]);
  await new Promise((r) => setTimeout(r, Math.max(0, startAt - Date.now())));
  const release = await acquireIssuanceLock("iss1|g@x.zm||diploma|2020");
  process.stdout.write(release ? "WON" : "LOST");
  await mongoose.disconnect();
`;

function runChild(startAt) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["--input-type=module", "-e", CHILD, String(startAt)], { cwd: fileURLToPath(new URL("..", import.meta.url)) });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err))));
  });
}

test("exactly one of several concurrent API processes wins the same reservation", async (t) => {
  if (!reachable) return t.skip("MongoDB not reachable");
  const startAt = Date.now() + 2500; // all children fire at the same instant
  const results = await Promise.all(Array.from({ length: 6 }, () => runChild(startAt)));
  assert.equal(results.filter((r) => r === "WON").length, 1, `results: ${results}`);
  assert.equal(results.filter((r) => r === "LOST").length, 5);
});

test("release frees the reservation; an expired reservation does not block a retry", async (t) => {
  if (!reachable) return t.skip("MongoDB not reachable");
  const { acquireIssuanceLock } = await import(SERVICE);
  const key = "iss2|h@x.zm||degree|2021";
  const release = await acquireIssuanceLock(key);
  assert.equal(typeof release, "function");
  assert.equal(await acquireIssuanceLock(key), null, "double-click: second request refused");
  await release();
  const again = await acquireIssuanceLock(key, { ttlMs: 1 });
  assert.equal(typeof again, "function", "free again after release");
  await new Promise((r) => setTimeout(r, 20));
  const afterExpiry = await acquireIssuanceLock(key);
  assert.equal(typeof afterExpiry, "function", "a stale reservation (crashed process) is taken over");
  await again(); // late release by the stale owner must not remove the new owner's reservation
  assert.equal(await acquireIssuanceLock(key), null);
  await afterExpiry();
});
