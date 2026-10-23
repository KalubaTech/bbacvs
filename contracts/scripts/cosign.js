// Co-sign a GovernanceSafe proposal with YOUR OWN owner key (D09 — second-custodian approval).
// Run by the ECZ or HEA key custodian on their own machine; the BBACVS API never sees this key.
//
//   SAFE_TX_ID=7 COSIGNER_PRIVATE_KEY=0x… npx hardhat run scripts/cosign.js --network sepolia
//     → prints what the proposal does, read from the chain. Nothing is sent.
//   SAFE_TX_ID=7 COSIGNER_PRIVATE_KEY=0x… CONFIRM=yes npx hardhat run scripts/cosign.js --network sepolia
//     → sends confirmTransaction(7); at threshold 2 the call executes.
//
// Check the printed account and institution against the regulator's approval decision BEFORE
// re-running with CONFIRM=yes.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const LABELS = ["ZAQA", "ECZ", "HEA"];

async function main() {
  const { SAFE_TX_ID, COSIGNER_PRIVATE_KEY, CONFIRM } = process.env;
  if (SAFE_TX_ID === undefined || !COSIGNER_PRIVATE_KEY) throw new Error("Set SAFE_TX_ID and COSIGNER_PRIVATE_KEY");
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", `deployments.${hre.network.name}.json`), "utf8"));
  const signer = new hre.ethers.Wallet(COSIGNER_PRIVATE_KEY, hre.ethers.provider);
  const safe = await hre.ethers.getContractAt("GovernanceSafe", dep.contracts.GovernanceSafe, signer);
  const registry = await hre.ethers.getContractAt("IssuerRegistry", dep.contracts.IssuerRegistry);

  if (!(await safe.isOwner(signer.address))) throw new Error(`${signer.address} is not a GovernanceSafe owner`);
  const owners = await Promise.all(LABELS.map((_, i) => safe.owners(i)));
  const t = await safe.transactions(SAFE_TX_ID);
  console.log(`GovernanceSafe ${dep.contracts.GovernanceSafe} — proposal #${SAFE_TX_ID}`);
  console.log(`  target      ${t.to}${t.to.toLowerCase() === dep.contracts.IssuerRegistry.toLowerCase() ? " (IssuerRegistry)" : " (NOT the IssuerRegistry)"}`);
  try {
    const call = registry.interface.parseTransaction({ data: t.data });
    const extra = call.name === "grantIssuerRole" ? `  account=${call.args[0]}  institution="${hre.ethers.decodeBytes32String(call.args[2])}"` : "";
    console.log(`  call        ${call.name}${extra}`);
  } catch {
    console.log(`  call        (unrecognised calldata) ${t.data}`);
  }
  console.log(`  executed    ${t.executed}   confirmations ${t.confirmations}/${await safe.threshold()}`);
  for (const [i, o] of owners.entries()) console.log(`  ${LABELS[i].padEnd(5)} ${o} ${(await safe.confirmed(SAFE_TX_ID, o)) ? "confirmed" : "—"}${o === signer.address ? "  ← you" : ""}`);

  if (t.executed) return console.log("\nAlready executed — nothing to do.");
  if (await safe.confirmed(SAFE_TX_ID, signer.address)) return console.log("\nYou already confirmed this proposal.");
  if (CONFIRM !== "yes") return console.log("\nDry run. Re-run with CONFIRM=yes to co-sign.");
  const receipt = await (await safe.confirmTransaction(SAFE_TX_ID)).wait();
  console.log(`\nConfirmed in ${receipt.hash}. Executed: ${(await safe.transactions(SAFE_TX_ID)).executed}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
