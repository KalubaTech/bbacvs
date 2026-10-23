// D09 — external custody: the API only proposes; the issuer becomes authorised only after the
// grant executes on-chain (second regulator co-signs outside the API). Fake chain adapter;
// throwaway MongoDB database (skipped when MongoDB is unreachable).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const BASE = process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017";
const DB_URI = `${BASE.replace(/\/$/, "")}/bbacvs_test_governance_${process.pid}`;

let reachable = true, Issuer, gov;
before(async () => {
  try {
    await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 1500 });
    ({ Issuer } = await import("../src/models/index.js"));
    gov = await import("../src/services/governance.service.js");
  } catch { reachable = false; }
});
after(async () => {
  if (reachable) await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
});

function fakeChain() {
  const state = { proposals: 0, authorised: new Set(), registered: 0 };
  return {
    state,
    proposeIssuerGrant: async () => ({ safeTxId: state.proposals++, txHash: "0xpropose" }),
    isIssuerAuthorised: async (addr) => state.authorised.has(addr),
    registerIssuerOnChain: async (addr) => { state.registered++; state.authorised.add(addr); return { authorised: true, txHash: "0xconfirm" }; },
  };
}

let n = 0;
const newIssuer = () => Issuer.create({
  institution: `Synthetic Institute ${++n}`, did: `did:ethr:0x${String(n).padStart(40, "0")}`,
  walletAddress: `0x${String(n).padStart(40, "0")}`, encPrivateKey: "x", publicKey: "x",
});

test("external mode proposes once and leaves the issuer unauthorised", async (t) => {
  if (!reachable) return t.skip("MongoDB not reachable");
  const chain = fakeChain();
  const issuer = await newIssuer();
  const r = await gov.requestIssuerAuthorisation(issuer, { chain, mode: "external" });
  assert.deepEqual(r, { pending: true, safeTxId: 0 });
  assert.equal(issuer.onChain, false);
  assert.equal(issuer.governanceProposal.status, "awaiting_cosign");
  assert.equal(chain.state.registered, 0, "the API must not confirm its own proposal");

  const again = await gov.requestIssuerAuthorisation(issuer, { chain, mode: "external" });
  assert.equal(again.safeTxId, 0);
  assert.equal(chain.state.proposals, 1, "a second approval click does not stack a second proposal");
});

test("the issuer becomes authorised only after the grant executes on-chain", async (t) => {
  if (!reachable) return t.skip("MongoDB not reachable");
  const chain = fakeChain();
  const issuer = await newIssuer();
  await gov.requestIssuerAuthorisation(issuer, { chain, mode: "external" });
  assert.equal(await gov.syncPendingProposals({ chain }), 0);
  assert.equal((await Issuer.findById(issuer._id)).onChain, false);

  chain.state.authorised.add(issuer.walletAddress); // ECZ/HEA co-signed from their own wallet
  assert.equal(await gov.syncPendingProposals({ chain }), 1);
  const fresh = await Issuer.findById(issuer._id);
  assert.equal(fresh.onChain, true);
  assert.equal(fresh.governanceProposal.status, "executed");
  assert.ok(fresh.events.some((e) => e.action === "institution.authorised_on_chain"));
});

test("server mode (prototype custody) still authorises immediately", async (t) => {
  if (!reachable) return t.skip("MongoDB not reachable");
  const chain = fakeChain();
  const issuer = await newIssuer();
  const r = await gov.requestIssuerAuthorisation(issuer, { chain, mode: "server" });
  assert.equal(r.authorised, true);
  assert.equal(issuer.onChain, true);
  assert.equal(chain.state.registered, 1);
});
