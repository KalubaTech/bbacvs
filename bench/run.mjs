// Objective 3 / D11 — controlled comparison of BBACVS online verification against a centralised
// baseline doing the same verifier task (bench/centralised-server.mjs). See bench/README.md.
//
//   node bench/run.mjs --mode isolated   # local Hardhat chain + local IPFS stand-in, synthetic records
//   node bench/run.mjs --mode sepolia    # real Sepolia RPC + Pinata gateway, read-only, existing records
//
// Options: --levels 1,5,10,25,50  --total 300  --reps 3  --records 200  --ipfs-delay 0
// Output:  bench/results/<mode>-<timestamp>/{raw.csv, summary.csv, summary.json, environment.json}
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") ? "true" : all[i + 1]]] : acc), []));
const MODE = args.mode || "isolated";
const ISOLATED = MODE === "isolated";
const LEVELS = (args.levels || (ISOLATED ? "1,5,10,25,50" : "1,2,5")).split(",").map(Number);
const TOTAL = Number(args.total || (ISOLATED ? 300 : 24));
const REPS = Number(args.reps || (ISOLATED ? 3 : 2));
const RECORDS = Number(args.records || 200);
const IPFS_DELAY = Number(args["ipfs-delay"] || 0);
const COLD_LEVELS = (args["cold-levels"] || (ISOLATED ? LEVELS.join(",") : "1,4")).split(",").map(Number);
const COLD_TOTAL = Number(args["cold-total"] || (ISOLATED ? TOTAL : 12));
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(HERE, "results", `${MODE}-${STAMP}`);
const DB = `bbacvs_bench_${process.pid}`;
const MONGO = `mongodb://127.0.0.1:27017/${DB}`;
fs.mkdirSync(OUT, { recursive: true });

const log = (...m) => console.log(`[bench ${new Date().toISOString().slice(11, 19)}]`, ...m);
const children = [];
function cleanup() { for (const c of children) { try { process.kill(-c.pid, "SIGTERM"); } catch { /* gone */ } } }
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

// Hardhat's well-known development accounts (isolated chain only — never funded on a real network).
const HH = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // #0 ZAQA
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // #1 ECZ
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // #2 HEA
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // #4 synthetic issuer
];

function readEnvFile(file) {
  return Object.fromEntries(fs.readFileSync(file, "utf8").split("\n").filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
}

function startChild(name, script, env, readyPattern) {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [script], { cwd: OUT, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    children.push(c);
    const logFile = fs.createWriteStream(path.join(OUT, `${name}.log`));
    let ready = false;
    const timer = setTimeout(() => !ready && reject(new Error(`${name} did not start`)), 60000);
    const onData = (d) => { logFile.write(d); if (!ready && readyPattern.test(String(d))) { ready = true; clearTimeout(timer); resolve(c); } };
    c.stdout.on("data", onData);
    c.stderr.on("data", (d) => logFile.write(d));
    c.on("exit", (code) => !ready && reject(new Error(`${name} exited (${code}) — see ${name}.log`)));
  });
}

// ---- seeding ---------------------------------------------------------------------------------
async function seedIsolated() {
  const { ethers } = await import("ethers");
  const rpc = args.rpc || "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(rpc, undefined, { cacheTimeout: -1 });
  const { chainId } = await provider.getNetwork();
  if (chainId !== 31337n) throw new Error(`Isolated mode needs a local Hardhat node (chainId 31337) at ${rpc}; got ${chainId}`);
  const [zaqa, ecz, hea, issuerW] = HH.map((k) => new ethers.NonceManager(new ethers.Wallet(k, provider)));
  const art = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, `contracts/artifacts/contracts/${n}.sol/${n}.json`), "utf8"));
  const deploy = async (n, ...a) => { const f = new ethers.ContractFactory(art(n).abi, art(n).bytecode, zaqa); const c = await f.deploy(...a); await c.waitForDeployment(); return c; };

  log("deploying contracts on the isolated chain");
  const safe = await deploy("GovernanceSafe", [await zaqa.getAddress(), await ecz.getAddress(), await hea.getAddress()], 2);
  const issuerReg = await deploy("IssuerRegistry", await safe.getAddress());
  const revReg = await deploy("RevocationRegistry", await issuerReg.getAddress(), await safe.getAddress());
  const credReg = await deploy("CredentialRegistry", await issuerReg.getAddress(), await revReg.getAddress(), await safe.getAddress());
  await (await revReg.bindCredentialRegistry(await credReg.getAddress())).wait();

  const issuerAddr = await issuerW.getAddress();
  const did = `did:ethr:${issuerAddr}`;
  const grant = issuerReg.interface.encodeFunctionData("grantIssuerRole", [issuerAddr, ethers.keccak256(ethers.toUtf8Bytes(did)), ethers.encodeBytes32String("Synthetic Bench University")]);
  const txId = await safe.transactionCount();
  await (await safe.proposeTransaction(await issuerReg.getAddress(), 0, grant)).wait();
  await (await safe.connect(ecz).confirmTransaction(txId)).wait();

  process.env.AES_256_KEY = "42".repeat(32); // benchmark-only key
  process.env.MONGODB_URI = MONGO;
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(MONGO);
  const { Issuer, CredentialIndex, Programme } = await import("../api/src/models/index.js");
  const { buildCredential, signCredential } = await import("../api/src/services/vc.service.js");
  const { credentialDigest, aesEncrypt } = await import("../api/src/services/crypto.service.js");
  const { publicKeyFor, buildCredentialQr } = await import("../api/src/services/signedQr.service.js");
  const { encryptKey } = await import("../api/src/services/keystore.service.js");
  const { CentralisedRecord } = await import("./centralised-server.mjs");

  const issuer = await Issuer.create({
    institution: "Synthetic Bench University", did, walletAddress: issuerAddr, encPrivateKey: encryptKey(HH[3]),
    publicKey: publicKeyFor(HH[3]), signingMode: "server", onChain: true, sector: "higher_ed", heaStatus: "approved", zaqaTrusted: true,
  });
  await Programme.create({ issuer: issuer._id, institution: issuer.institution, name: "BSc Benchmark Studies", zqfLevel: 7, status: "approved" });

  log(`seeding ${RECORDS} synthetic credentials (sign, encrypt, anchor)`);
  const blobs = {}, rows = [], central = [], hashes = [], cidHashes = [];
  for (let i = 0; i < RECORDS; i++) {
    const claims = { name: `Synthetic Graduate ${i}`, nationalId: `${String(100000 + i)}/10/1`, qualification: "BSc Benchmark Studies", graduationYear: 2024 };
    const holderDID = `did:ethr:${ethers.Wallet.createRandom().address}`;
    const signedVC = signCredential(buildCredential({ issuerDID: did, holderDID, claims }), HH[3], did);
    const credentialHash = credentialDigest(signedVC, 2);
    const cid = `bafybench${credentialHash.slice(2, 50)}`;
    blobs[cid] = aesEncrypt(signedVC);
    hashes.push(credentialHash); cidHashes.push(ethers.keccak256(ethers.toUtf8Bytes(cid)));
    rows.push({
      credentialHash, hashVersion: 2, cid, issuer: issuer._id, issuerAddress: issuerAddr, issuerDID: did, institution: issuer.institution,
      issuerPublicKey: issuer.publicKey, holderDID, holderEmail: `graduate${i}@bench.invalid`, subjectName: claims.name,
      holderNationalId: claims.nationalId, qualification: claims.qualification, graduationYear: claims.graduationYear,
      zqfLevel: 7, credentialType: "degree", status: "active", zaqaValidation: "validated",
      qrPayload: buildCredentialQr({ credentialHash, cid, holderDID, issuerDID: did }, HH[3]),
    });
    central.push({ credentialHash, signedVC });
  }
  // First anchor alone (records single-anchor gas), the rest in batches.
  const single = await (await credReg.connect(issuerW).issueCredential(hashes[0], cidHashes[0])).wait();
  for (let i = 1; i < hashes.length; i += 25) {
    await (await credReg.connect(issuerW).batchIssue(hashes.slice(i, i + 25), cidHashes.slice(i, i + 25))).wait();
  }
  await CredentialIndex.insertMany(rows);
  await CentralisedRecord.insertMany(central);
  fs.writeFileSync(path.join(OUT, "ipfs-store.json"), JSON.stringify(blobs));
  await mongoose.disconnect();

  const env = {
    SEPOLIA_RPC_URL: rpc, CREDENTIAL_REGISTRY_ADDRESS: await credReg.getAddress(), REVOCATION_REGISTRY_ADDRESS: await revReg.getAddress(),
    ISSUER_REGISTRY_ADDRESS: await issuerReg.getAddress(), GOVERNANCE_SAFE_ADDRESS: await safe.getAddress(),
    AES_256_KEY: process.env.AES_256_KEY, IPFS_FETCH_BASE: "http://127.0.0.1:4102",
  };
  return { ids: hashes, env, gas: { singleAnchorGasUsed: Number(single.gasUsed), note: "Hardhat local EVM gas schedule; see sepolia mode for live-network gas" } };
}

async function seedSepolia() {
  // Read-only copies of the deployment's records into a throwaway database. Nothing is written
  // to the production database or the chain; the copy is dropped at the end.
  const prod = readEnvFile(path.join(ROOT, "api/.env"));
  Object.assign(process.env, { AES_256_KEY: prod.AES_256_KEY, PINATA_JWT: prod.PINATA_JWT || "", PINATA_GATEWAY: prod.PINATA_GATEWAY || "", MONGODB_URI: MONGO });
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(MONGO);
  const src = mongoose.connection.useDb(new URL(prod.MONGODB_URI).pathname.slice(1) || "bbacvs", { useCache: true });
  const dst = mongoose.connection.db;
  for (const coll of ["issuers", "credentialindexes", "programmes"]) {
    const docs = await src.db.collection(coll).find({}).toArray();
    if (docs.length) await dst.collection(coll).insertMany(docs);
  }
  const creds = await dst.collection("credentialindexes").find({}).toArray();
  const { fetchByCid } = await import("../api/src/services/ipfs.service.js");
  const { aesDecrypt } = await import("../api/src/services/crypto.service.js");
  const { CentralisedRecord } = await import("./centralised-server.mjs");
  log(`copying ${creds.length} records; fetching their signed VCs once for the centralised store`);
  for (const c of creds) {
    await CentralisedRecord.create({ credentialHash: c.credentialHash, signedVC: JSON.parse(aesDecrypt(await fetchByCid(c.cid))) });
  }
  await mongoose.disconnect();
  const env = {
    SEPOLIA_RPC_URL: prod.SEPOLIA_RPC_URL, CREDENTIAL_REGISTRY_ADDRESS: prod.CREDENTIAL_REGISTRY_ADDRESS,
    REVOCATION_REGISTRY_ADDRESS: prod.REVOCATION_REGISTRY_ADDRESS, ISSUER_REGISTRY_ADDRESS: prod.ISSUER_REGISTRY_ADDRESS,
    GOVERNANCE_SAFE_ADDRESS: prod.GOVERNANCE_SAFE_ADDRESS, AES_256_KEY: prod.AES_256_KEY,
    PINATA_JWT: prod.PINATA_JWT || "", PINATA_GATEWAY: prod.PINATA_GATEWAY || "",
  };
  // Live-network anchoring cost: gas of the re-anchors made on 2026-10-23 (receipts on Sepolia).
  const { ethers } = await import("ethers");
  const provider = new ethers.JsonRpcProvider(prod.SEPOLIA_RPC_URL);
  const used = [];
  for (const c of creds.filter((x) => x.anchorTx)) {
    const r = await provider.getTransactionReceipt(c.anchorTx).catch(() => null);
    if (r) used.push({ gasUsed: Number(r.gasUsed), effectiveGasPriceWei: String(r.gasPrice) });
  }
  return { ids: creds.map((c) => c.credentialHash), env, gas: { anchors: used } };
}

// ---- load generation -------------------------------------------------------------------------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function shuffled(ids, seed) { const r = rng(seed); const a = [...ids]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : null);

async function runLoad(baseUrl, ids, { concurrency, total, seed, expect }) {
  const order = shuffled(ids, seed);
  const samples = [];
  let next = 0;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (;;) {
      const k = next++;
      if (k >= total) return;
      const id = order[k % order.length];
      const s = performance.now();
      let http = 0, status = "ERROR";
      try {
        const res = await fetch(`${baseUrl}/api/verify/${id}`);
        http = res.status;
        status = (await res.json()).displayStatus || `HTTP_${res.status}`;
      } catch (e) { status = `ERROR:${e.cause?.code || e.message}`; }
      samples.push({ seq: k, id, ms: performance.now() - s, http, status, ok: http === 200 && status === expect[id] });
    }
  }));
  return { samples, wallMs: performance.now() - t0 };
}

function summarise(samples, wallMs) {
  const ok = samples.filter((x) => x.ok);
  const lat = ok.map((x) => x.ms).sort((a, b) => a - b);
  return {
    requests: samples.length, succeeded: ok.length, failed: samples.length - ok.length,
    errorRate: (samples.length - ok.length) / samples.length,
    // Successful answers per second: failures (e.g. instant connection errors) must not count.
    throughputPerSec: (ok.length / wallMs) * 1000,
    attemptsPerSec: (samples.length / wallMs) * 1000,
    meanMs: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null,
    p50Ms: pct(lat, 50), p95Ms: pct(lat, 95), p99Ms: pct(lat, 99), maxMs: lat.at(-1) ?? null,
  };
}

// ---- main ------------------------------------------------------------------------------------
const seeded = ISOLATED ? await seedIsolated() : await seedSepolia();
const common = { NODE_ENV: "production", JWT_SECRET: "bench-only", MONGODB_URI: MONGO, RATE_LIMIT_PER_MIN: "100000000", CORS_ORIGIN: "http://127.0.0.1" };
// The IPFS stand-in runs in its own process (store file, port, fixed delay).
if (ISOLATED) {
  await new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [path.join(HERE, "ipfs-standin.mjs"), path.join(OUT, "ipfs-store.json"), "4102", String(IPFS_DELAY)], { cwd: OUT, detached: true, stdio: ["ignore", "pipe", "inherit"] });
    children.push(c);
    c.stdout.on("data", (d) => /stand-in/.test(String(d)) && resolve());
    c.on("exit", (code) => reject(new Error(`ipfs stand-in exited ${code}`)));
  });
}
const apiEntry = path.join(ROOT, "api/src/index.js");
const systems = [
  { key: "baseline", label: "Centralised baseline", url: "http://127.0.0.1:4101", script: path.join(HERE, "centralised-server.mjs"), env: { ...common, PORT: "4101" }, ready: /centralised baseline/ },
  { key: "bbacvs_warm", label: "BBACVS (IPFS cache warm)", url: "http://127.0.0.1:4100", script: apiEntry, env: { ...common, ...seeded.env, PORT: "4100" }, ready: /listening/ },
  { key: "bbacvs_cold", label: "BBACVS (IPFS cache off)", url: "http://127.0.0.1:4103", script: apiEntry, env: { ...common, ...seeded.env, PORT: "4103", INTEGRITY_CACHE: "off" }, ready: /listening/, cold: true },
];
for (const s of systems) { log(`starting ${s.label}`); await startChild(s.key, s.script, s.env, s.ready); }

// Correctness pass: every system must give the expected verdict for every record. The expected
// verdict is BBACVS's own (warm) answer; the baseline and the cold path must agree with it.
log("correctness pass (also warms the BBACVS cache)");
const expect = {};
for (const id of seeded.ids) {
  const r = await fetch(`${systems[1].url}/api/verify/${id}`).then((x) => x.json());
  expect[id] = r.displayStatus;
}
const correctness = {};
for (const s of systems) {
  const { samples } = await runLoad(s.url, seeded.ids, { concurrency: 1, total: seeded.ids.length, seed: 1, expect });
  correctness[s.key] = { checked: samples.length, agree: samples.filter((x) => x.ok).length, statuses: samples.reduce((m, x) => ((m[x.status] = (m[x.status] || 0) + 1), m), {}) };
}
log("correctness:", JSON.stringify(correctness));

const raw = fs.createWriteStream(path.join(OUT, "raw.csv"));
raw.write("system,concurrency,rep,seq,latency_ms,http_status,display_status,ok\n");
const results = [];
for (const c of [...new Set([...LEVELS, ...COLD_LEVELS])].sort((a, b) => a - b)) {
  for (let rep = 1; rep <= REPS; rep++) {
    // Rotate the system order per repetition so slow drift does not favour one system.
    const order = systems.map((_, i) => systems[(i + rep) % systems.length]);
    for (const s of order) {
      const levels = s.cold ? COLD_LEVELS : LEVELS;
      if (!levels.includes(c)) continue;
      const total = s.cold ? COLD_TOTAL : TOTAL;
      await runLoad(s.url, seeded.ids, { concurrency: Math.min(c, 5), total: Math.min(10, total), seed: 99, expect }); // short warm-up
      const { samples, wallMs } = await runLoad(s.url, seeded.ids, { concurrency: c, total, seed: rep * 1000 + c, expect });
      for (const x of samples) raw.write(`${s.key},${c},${rep},${x.seq},${x.ms.toFixed(3)},${x.http},${x.status},${x.ok}\n`);
      const sum = { system: s.key, label: s.label, concurrency: c, rep, ...summarise(samples, wallMs) };
      results.push(sum);
      log(`${s.key.padEnd(12)} c=${String(c).padStart(2)} rep ${rep}: p50 ${sum.p50Ms?.toFixed(1)} ms, p95 ${sum.p95Ms?.toFixed(1)} ms, ${sum.throughputPerSec.toFixed(1)} req/s, failed ${sum.failed}`);
    }
  }
}
raw.end();

const header = Object.keys(results[0]);
fs.writeFileSync(path.join(OUT, "summary.csv"), [header.join(","), ...results.map((r) => header.map((h) => (typeof r[h] === "number" ? +r[h].toFixed(3) : r[h])).join(","))].join("\n") + "\n");
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ mode: MODE, correctness, results }, null, 2));

const sh = (cmd) => { try { return execSync(cmd, { encoding: "utf8" }).trim(); } catch { return null; } };
fs.writeFileSync(path.join(OUT, "environment.json"), JSON.stringify({
  mode: MODE, startedAt: STAMP, commit: sh(`git -C ${ROOT} rev-parse HEAD`), dirty: !!sh(`git -C ${ROOT} status --porcelain -- api bench contracts ':!bench/results'`), // own output excluded
  node: process.version, mongo: sh("mongod --version | head -1"), hardhat: ISOLATED ? sh(`cd ${ROOT}/contracts && npx hardhat --version`) : null,
  host: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, memGB: +(os.totalmem() / 2 ** 30).toFixed(1), loadavgAtEnd: os.loadavg(), platform: `${os.type()} ${os.release()}` },
  colocation: "Load generator, both servers, MongoDB" + (ISOLATED ? ", Hardhat node and IPFS stand-in" : "") + " on the same host (loopback). Production services kept running on the host.",
  plan: { levels: LEVELS, totalPerRun: TOTAL, reps: REPS, coldLevels: COLD_LEVELS, coldTotal: COLD_TOTAL, records: seeded.ids.length, ipfsDelayMs: ISOLATED ? IPFS_DELAY : "real Pinata gateway", rateLimit: "raised to 1e8/min on both systems" },
  dependencies: ISOLATED
    ? { chain: "local Hardhat node (automine)", ipfs: `local stand-in, fixed delay ${IPFS_DELAY} ms` }
    : { chain: "Ethereum Sepolia via SEPOLIA_RPC_URL", ipfs: "Pinata gateway" },
  cost: seeded.gas,
}, null, 2));

// Drop the throwaway database.
const mongoose = (await import("mongoose")).default;
await mongoose.connect(MONGO); await mongoose.connection.dropDatabase(); await mongoose.disconnect();
cleanup();
log(`done → ${path.relative(ROOT, OUT)}`);
process.exit(0);
