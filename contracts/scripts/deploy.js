// Deploys the full BBACVS on-chain stack and wires governance.
// Order: GovernanceSafe -> IssuerRegistry(gov) -> RevocationRegistry(issuerReg)
//        -> CredentialRegistry(issuerReg, revReg, gov)
//
// Usage: npx hardhat run scripts/deploy.js --network sepolia
require("dotenv").config();
const hre = require("hardhat");

async function main() {
  const { GOV_OWNER_ZQA, GOV_OWNER_ECZ, GOV_OWNER_HEA } = process.env;
  const owners = [GOV_OWNER_ZQA, GOV_OWNER_ECZ, GOV_OWNER_HEA];

  if (owners.some((o) => !o || o === "0x0000000000000000000000000000000000000000")) {
    throw new Error("Set GOV_OWNER_ZQA / GOV_OWNER_ECZ / GOV_OWNER_HEA in .env");
  }

  console.log("Deploying GovernanceSafe (2-of-3: ZQA, ECZ, HEA)...");
  const Safe = await hre.ethers.getContractFactory("GovernanceSafe");
  const safe = await Safe.deploy(owners, 2);
  await safe.waitForDeployment();
  const safeAddr = await safe.getAddress();

  console.log("Deploying IssuerRegistry...");
  const IssuerRegistry = await hre.ethers.getContractFactory("IssuerRegistry");
  const issuerRegistry = await IssuerRegistry.deploy(safeAddr);
  await issuerRegistry.waitForDeployment();
  const issuerAddr = await issuerRegistry.getAddress();

  console.log("Deploying RevocationRegistry...");
  const RevocationRegistry = await hre.ethers.getContractFactory("RevocationRegistry");
  const revocationRegistry = await RevocationRegistry.deploy(issuerAddr);
  await revocationRegistry.waitForDeployment();
  const revAddr = await revocationRegistry.getAddress();

  console.log("Deploying CredentialRegistry...");
  const CredentialRegistry = await hre.ethers.getContractFactory("CredentialRegistry");
  const credentialRegistry = await CredentialRegistry.deploy(issuerAddr, revAddr, safeAddr);
  await credentialRegistry.waitForDeployment();
  const credAddr = await credentialRegistry.getAddress();

  console.log("\nBBACVS deployment complete:");
  console.table({
    GovernanceSafe: safeAddr,
    IssuerRegistry: issuerAddr,
    RevocationRegistry: revAddr,
    CredentialRegistry: credAddr,
  });
  console.log("\nNext: register issuers via a 2-of-3 GovernanceSafe proposal calling");
  console.log("IssuerRegistry.grantIssuerRole(account, did, institution).");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
