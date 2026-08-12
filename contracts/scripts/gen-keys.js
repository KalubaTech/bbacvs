// One-off: generate a testnet governance keyset (ZQA/ECZ/HEA). Deployer = ZQA.
// Saves private keys to governance-keys.json (gitignored, mode 600). Prints addresses only.
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const roles = ["ZQA", "ECZ", "HEA"];
const wallets = roles.map((role) => {
  const w = ethers.Wallet.createRandom();
  return { role, address: w.address, privateKey: w.privateKey };
});

const outFile = path.join(__dirname, "..", "governance-keys.json");
fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      network: "sepolia",
      note: "TESTNET ONLY. Worthless Sepolia ETH. Deployer = ZQA. Keep private.",
      generatedAt: new Date().toISOString(),
      wallets,
    },
    null,
    2
  )
);
fs.chmodSync(outFile, 0o600);

console.log("Saved keys -> contracts/governance-keys.json (mode 600)");
for (const w of wallets) console.log(`${w.role}: ${w.address}`);
console.log("\nDEPLOYER (fund this address with Sepolia ETH):", wallets[0].address);
