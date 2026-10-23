// Redeploys ONLY the credential-lifecycle contracts (RevocationRegistry + CredentialRegistry)
// against the existing GovernanceSafe and IssuerRegistry, so issuer authorisations are kept.
// Needed for the D01 fix (issuer-scoped revocation), which changes RevocationRegistry's storage
// and constructor. The previous addresses are kept under `legacy` in deployments.sepolia.json;
// existing credentials are then re-anchored by api/scripts/migrate-lifecycle.js.
//
// Usage: npx hardhat run scripts/redeploy-lifecycle.js --network sepolia
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const file = path.join(__dirname, "..", `deployments.${hre.network.name}.json`);
  const dep = JSON.parse(fs.readFileSync(file, "utf8"));
  const { GovernanceSafe: safeAddr, IssuerRegistry: issuerAddr } = dep.contracts;
  if (!safeAddr || !issuerAddr) throw new Error(`GovernanceSafe/IssuerRegistry missing in ${file}`);

  console.log("Deploying RevocationRegistry (issuer-scoped)...");
  const RevocationRegistry = await hre.ethers.getContractFactory("RevocationRegistry");
  const rev = await RevocationRegistry.deploy(issuerAddr, safeAddr);
  await rev.waitForDeployment();
  const revAddr = await rev.getAddress();

  console.log("Deploying CredentialRegistry...");
  const CredentialRegistry = await hre.ethers.getContractFactory("CredentialRegistry");
  const cred = await CredentialRegistry.deploy(issuerAddr, revAddr, safeAddr);
  await cred.waitForDeployment();
  const credAddr = await cred.getAddress();

  await (await rev.bindCredentialRegistry(credAddr)).wait();

  const block = await hre.ethers.provider.getBlockNumber();
  dep.legacy = dep.legacy || [];
  dep.legacy.push({
    retiredAt: new Date().toISOString(),
    reason: "D01: RevocationRegistry did not bind revocation to the credential's recorded issuer",
    RevocationRegistry: dep.contracts.RevocationRegistry,
    CredentialRegistry: dep.contracts.CredentialRegistry,
  });
  dep.contracts.RevocationRegistry = revAddr;
  dep.contracts.CredentialRegistry = credAddr;
  dep.lifecycleDeployedAtBlock = block;
  fs.writeFileSync(file, JSON.stringify(dep, null, 2) + "\n");

  console.table({ RevocationRegistry: revAddr, CredentialRegistry: credAddr, block });
  console.log(`\nUpdated ${path.basename(file)}. Next: set REVOCATION_REGISTRY_ADDRESS / CREDENTIAL_REGISTRY_ADDRESS`);
  console.log("in api/.env, then run api/scripts/migrate-lifecycle.js to re-anchor existing credentials.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
