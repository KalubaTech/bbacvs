// Real end-to-end issuance on Sepolia (no Pinata needed for the on-chain path):
//  1. fund an issuer account with gas
//  2. authorise it via a 2-of-3 GovernanceSafe proposal (ZQA proposes, ECZ confirms→executes)
//  3. build a W3C VC, SHA-256 hash it, anchor (hash, cidHash) on-chain
//  4. read back on-chain verification status -> VERIFIED
//
// Usage: npx hardhat run scripts/demo-issue.js --network sepolia
require("dotenv").config();
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ethers = hre.ethers;
const P = (n) => ethers.parseEther(n);

async function ensureGas(from, to, minEth, topUpEth, label) {
  const bal = await ethers.provider.getBalance(to.address);
  if (bal < P(minEth)) {
    console.log(`Funding ${label} (${to.address}) with ${topUpEth} ETH...`);
    const tx = await from.sendTransaction({ to: to.address, value: P(topUpEth) });
    await tx.wait();
  }
}

async function main() {
  const dir = path.join(__dirname, "..");
  const deployments = JSON.parse(fs.readFileSync(path.join(dir, "deployments.sepolia.json")));
  const gov = JSON.parse(fs.readFileSync(path.join(dir, "governance-keys.json")));
  const byRole = Object.fromEntries(gov.wallets.map((w) => [w.role, w]));

  const provider = ethers.provider;
  const zqa = new ethers.Wallet(byRole.ZQA.privateKey, provider); // = deployer, has funds
  const ecz = new ethers.Wallet(byRole.ECZ.privateKey, provider);

  // Persistent issuer wallet (a mock accredited institution).
  const issuerFile = path.join(dir, "issuer-key.json");
  let issuerInfo;
  if (fs.existsSync(issuerFile)) {
    issuerInfo = JSON.parse(fs.readFileSync(issuerFile));
  } else {
    const w = ethers.Wallet.createRandom();
    issuerInfo = { institution: "UNZA", address: w.address, privateKey: w.privateKey };
    fs.writeFileSync(issuerFile, JSON.stringify(issuerInfo, null, 2));
    fs.chmodSync(issuerFile, 0o600);
  }
  const issuer = new ethers.Wallet(issuerInfo.privateKey, provider);
  console.log("Issuer:", issuerInfo.institution, issuer.address);

  const c = deployments.contracts;
  const safe = await ethers.getContractAt("GovernanceSafe", c.GovernanceSafe, zqa);
  const issuerRegistry = await ethers.getContractAt("IssuerRegistry", c.IssuerRegistry, zqa);
  const credReg = await ethers.getContractAt("CredentialRegistry", c.CredentialRegistry, issuer);

  // 1. gas
  await ensureGas(zqa, issuer, "0.004", "0.006", "issuer");
  await ensureGas(zqa, ecz, "0.003", "0.004", "ECZ");

  // 2. authorise issuer via 2-of-3 multisig
  if (!(await issuerRegistry.isAuthorised(issuer.address))) {
    const did = ethers.keccak256(ethers.toUtf8Bytes("did:ethr:" + issuer.address));
    const institution = ethers.encodeBytes32String(issuerInfo.institution);
    const data = issuerRegistry.interface.encodeFunctionData("grantIssuerRole", [
      issuer.address, did, institution,
    ]);
    const txId = await safe.transactionCount(); // next index
    console.log(`ZQA proposing grantIssuerRole (txId ${txId})...`);
    await (await safe.connect(zqa).proposeTransaction(c.IssuerRegistry, 0, data)).wait();
    console.log("ECZ confirming (executes at threshold 2)...");
    await (await safe.connect(ecz).confirmTransaction(txId)).wait();
  }
  console.log("Issuer authorised on-chain:", await issuerRegistry.isAuthorised(issuer.address));

  // 3. build VC + anchor
  const vc = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", "AcademicCredential"],
    issuer: { id: "did:ethr:" + issuer.address, name: issuerInfo.institution },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: "did:ethr:0x" + "a".repeat(40),
      name: "Astridah Chibale",
      qualification: "Bachelor of ICT",
      graduationYear: 2026,
    },
  };
  const vcJson = JSON.stringify(vc);
  const credHash = "0x" + crypto.createHash("sha256").update(vcJson).digest("hex");
  const cid = "QmDemoPlaceholderCID_pin_with_Pinata"; // not pinned yet (no Pinata key)
  const cidHash = ethers.keccak256(ethers.toUtf8Bytes(cid));

  const existing = await credReg.getCredential(credHash);
  if (existing.issuedAt === 0n) {
    console.log("Anchoring credential on-chain...");
    await (await credReg.connect(issuer).issueCredential(credHash, cidHash)).wait();
  } else {
    console.log("Credential already anchored.");
  }

  // 4. verify
  const [status] = await credReg.verifyCredential(credHash);
  const names = ["NOT_FOUND", "VERIFIED", "REVOKED", "UNKNOWN_ISSUER"];
  console.log("\n=== RESULT ===");
  console.log("On-chain status:", names[Number(status)]);
  console.log("CREDENTIAL_HASH:", credHash);

  fs.writeFileSync(
    path.join(dir, "demo-credential.json"),
    JSON.stringify({ credentialHash: credHash, cid, vc }, null, 2)
  );
  console.log("Saved -> contracts/demo-credential.json");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
