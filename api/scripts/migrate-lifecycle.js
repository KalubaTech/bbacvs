// Re-anchors existing credentials on the redeployed lifecycle contracts (D01) and replays their
// revocations, signing as each credential's ORIGINAL issuer (custodied keys) so the new
// RevocationRegistry's ownership checks hold for historical records too.
//
//   node scripts/migrate-lifecycle.js            # dry run: report what would happen
//   node scripts/migrate-lifecycle.js --apply    # execute
//
// Reads the NEW addresses from api/.env (CREDENTIAL_REGISTRY_ADDRESS / REVOCATION_REGISTRY_ADDRESS).
// Idempotent: anchors and revocations already present on the new contracts are skipped.
// Each migrated record keeps its old anchor tx in `legacyAnchorTx` and gets a
// `credential.migrated` history event. On-chain issuedAt becomes the migration time; the original
// issuance date stays in the index (issuedAt) and on the retired registry.
import { ethers } from "ethers";
import mongoose from "mongoose";
import { connectDB, CredentialIndex, Issuer } from "../src/models/index.js";
import { config } from "../src/config/index.js";
import { decryptKey } from "../src/services/keystore.service.js";
import { pushEvent } from "../src/services/history.service.js";
import { anchorCredentialAs, revokeCredentialAs, reissueCredentialAs, getProvider } from "../src/services/web3.service.js";

const APPLY = process.argv.includes("--apply");
const MIN_GAS = ethers.parseEther("0.003");
const TOP_UP = ethers.parseEther("0.006");

const credReg = new ethers.Contract(config.chain.credentialRegistry, [
  "function getCredential(bytes32) view returns (tuple(address issuer, uint64 issuedAt, uint32 _gap, bytes32 cidHash, bytes32 issuerDID))",
], getProvider());
const revReg = new ethers.Contract(config.chain.revocationRegistry, [
  "function isRevoked(bytes32) view returns (bool)",
  "function credentials() view returns (address)",
], getProvider());

async function main() {
  await connectDB();
  const bound = await revReg.credentials();
  if (bound.toLowerCase() !== config.chain.credentialRegistry.toLowerCase()) {
    throw new Error(`RevocationRegistry is bound to ${bound}, not ${config.chain.credentialRegistry}`);
  }
  const funder = new ethers.Wallet(config.governance.funder || config.governance.signer1, getProvider());
  const creds = await CredentialIndex.find({ anchorTx: { $exists: true, $ne: null }, status: { $in: ["active", "suspended", "revoked"] } }).sort({ createdAt: 1 });
  const issuers = new Map();
  const log = [];

  // Pass 1 — anchors (replacements must exist before a supersession can point at them).
  for (const cred of creds) {
    const onNew = await credReg.getCredential(cred.credentialHash);
    if (onNew.issuedAt !== 0n) { log.push([cred.credentialHash, "anchor", "already present"]); continue; }
    if (!issuers.has(String(cred.issuer))) issuers.set(String(cred.issuer), await Issuer.findById(cred.issuer));
    const issuer = issuers.get(String(cred.issuer));
    if (!issuer?.encPrivateKey) { log.push([cred.credentialHash, "anchor", "SKIPPED: no custodied issuer key"]); continue; }
    if (!APPLY) { log.push([cred.credentialHash, "anchor", `would anchor as ${issuer.institution}`]); continue; }
    if ((await getProvider().getBalance(issuer.walletAddress)) < MIN_GAS) {
      await (await funder.sendTransaction({ to: issuer.walletAddress, value: TOP_UP, gasLimit: 21000 })).wait();
    }
    const cidHash = ethers.keccak256(ethers.toUtf8Bytes(cred.cid));
    const { txHash } = await anchorCredentialAs(decryptKey(issuer.encPrivateKey), cred.credentialHash, cidHash);
    const legacy = cred.anchorTx;
    cred.legacyAnchorTx = legacy;
    cred.anchorTx = txHash;
    pushEvent(cred, null, "credential.migrated", "Re-anchored on the issuer-scoped lifecycle contracts (D01)", { legacyAnchorTx: legacy, txHash });
    await cred.save();
    log.push([cred.credentialHash, "anchor", txHash]);
  }

  // Pass 2 — revocations / supersessions, as the original issuer.
  for (const cred of creds.filter((c) => c.status === "revoked")) {
    if (await revReg.isRevoked(cred.credentialHash)) { log.push([cred.credentialHash, "revoke", "already revoked"]); continue; }
    const issuer = issuers.get(String(cred.issuer)) || await Issuer.findById(cred.issuer);
    const how = cred.supersededBy ? `reissue → ${cred.supersededBy.slice(0, 10)}` : `revoke reason ${cred.reasonCode || 5}`;
    if (!APPLY) { log.push([cred.credentialHash, "revoke", `would ${how}`]); continue; }
    const key = decryptKey(issuer.encPrivateKey);
    const { txHash } = cred.supersededBy
      ? await reissueCredentialAs(key, cred.credentialHash, cred.supersededBy)
      : await revokeCredentialAs(key, cred.credentialHash, cred.reasonCode || 5);
    pushEvent(cred, null, "credential.migrated", `Revocation replayed on the issuer-scoped contracts (${how})`, { txHash });
    await cred.save();
    log.push([cred.credentialHash, "revoke", txHash]);
  }

  console.log(`${APPLY ? "APPLIED" : "DRY RUN"} — CredentialRegistry ${config.chain.credentialRegistry}, RevocationRegistry ${config.chain.revocationRegistry}`);
  for (const [h, step, result] of log) console.log(`${h.slice(0, 12)}…  ${step.padEnd(6)}  ${result}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
