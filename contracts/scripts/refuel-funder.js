// Sweeps surplus Sepolia ETH from ECZ + UNZA back to ZQA (the API's funder), keeping a
// small reserve in each. Recovers ETH after over-funded registration attempts.
require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const dir = path.join(__dirname, "..");
  const gov = JSON.parse(fs.readFileSync(path.join(dir, "governance-keys.json")));
  const byRole = Object.fromEntries(gov.wallets.map((w) => [w.role, w]));
  const issuer = JSON.parse(fs.readFileSync(path.join(dir, "issuer-key.json")));

  const zqa = byRole.ZQA.address;
  const sources = [
    { name: "ECZ", pk: byRole.ECZ.privateKey, reserve: "0.0015" },
    { name: "UNZA", pk: issuer.privateKey, reserve: "0.0015" },
  ];

  for (const s of sources) {
    const w = new ethers.Wallet(s.pk, provider);
    const bal = await provider.getBalance(w.address);
    const reserve = ethers.parseEther(s.reserve);
    const gasCost = ethers.parseEther("0.0003"); // rough tx cost buffer
    const send = bal - reserve - gasCost;
    if (send > 0n) {
      const tx = await w.sendTransaction({ to: zqa, value: send });
      await tx.wait();
      console.log(`${s.name}: swept ${ethers.formatEther(send)} ETH -> ZQA`);
    } else {
      console.log(`${s.name}: nothing to sweep (bal ${ethers.formatEther(bal)})`);
    }
  }
  console.log("ZQA now:", ethers.formatEther(await provider.getBalance(zqa)), "ETH");
}
main().catch((e) => { console.error(e); process.exit(1); });
