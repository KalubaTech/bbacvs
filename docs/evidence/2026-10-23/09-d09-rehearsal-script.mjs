// D09 rehearsal on an isolated Hardhat chain: API in external custody mode proposes; the ECZ
// custodian co-signs with contracts/scripts/cosign.js; the API sync marks the issuer authorised.
import { execFileSync } from "node:child_process";
const api = "/var/www/bbacvs/api/src";
const { ethers } = await import("/var/www/bbacvs/node_modules/ethers/lib.esm/index.js");
const mongoose = (await import("/var/www/bbacvs/node_modules/mongoose/index.js")).default;
const { Issuer } = await import(`${api}/models/index.js`);
const { config } = await import(`${api}/config/index.js`);
const gov = await import(`${api}/services/governance.service.js`);
const { getSafeProposal, isIssuerAuthorised } = await import(`${api}/services/web3.service.js`);
await mongoose.connect(process.env.MONGODB_URI);
console.log("custody mode:", config.governance.cosignMode, "| API holds signer2:", !!config.governance.signer2);
const wallet = ethers.Wallet.createRandom();
const issuer = await Issuer.create({ institution: "Synthetic Rehearsal College", did: `did:ethr:${wallet.address}`, walletAddress: wallet.address, encPrivateKey: "x", publicKey: "x" });
const r = await gov.requestIssuerAuthorisation(issuer);
console.log("1. approval → requestIssuerAuthorisation:", JSON.stringify(r), "| onChain:", issuer.onChain, "| isAuthorised on-chain:", await isIssuerAuthorised(wallet.address));
const p = await getSafeProposal(r.safeTxId);
console.log("2. proposal on-chain:", JSON.stringify({ executed: p.executed, confirmations: p.confirmations, confirmedBy: p.confirmedBy.filter((o) => o.confirmed).map((o) => o.label), call: p.call }));
const cosign = (key, confirm) => {
  try {
    return execFileSync("npx", ["hardhat", "run", "scripts/cosign.js", "--network", "localhost"], {
      cwd: "/var/www/bbacvs/contracts", encoding: "utf8",
      env: { ...process.env, SAFE_TX_ID: String(r.safeTxId), COSIGNER_PRIVATE_KEY: key, CONFIRM: confirm ? "yes" : "" },
    });
  } catch (e) { return `ERROR: ${(e.stderr || e.stdout || e.message).trim().split("\n").pop()}`; }
};
const NON_OWNER = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"; // hardhat #3
const ECZ = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";      // hardhat #1
console.log("3. non-owner tries to co-sign →", cosign(NON_OWNER, true).trim());
console.log("4. ECZ custodian dry run →\n" + cosign(ECZ, false).trim());
console.log("5. sync before co-signature → newly authorised:", await gov.syncPendingProposals());
console.log("6. ECZ custodian co-signs →\n" + cosign(ECZ, true).trim());
console.log("7. sync after co-signature → newly authorised:", await gov.syncPendingProposals());
const fresh = await Issuer.findById(issuer._id).lean();
console.log("8. issuer onChain:", fresh.onChain, "| proposal:", fresh.governanceProposal.status, "| isAuthorised on-chain:", await isIssuerAuthorised(wallet.address));
await mongoose.connection.dropDatabase();
await mongoose.disconnect();
