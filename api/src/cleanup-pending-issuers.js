// Removes issuers that never completed on-chain registration (onChain:false),
// sweeps their funded wallets back to the funder, and deletes their officer users.
// Usage: node src/cleanup-pending-issuers.js
import mongoose from "mongoose";
import { ethers } from "ethers";
import { connectDB, Issuer, User } from "./models/index.js";
import { config } from "./config/index.js";
import { decryptKey } from "./services/keystore.service.js";
import { getProvider } from "./services/web3.service.js";

async function main() {
  await connectDB();
  const funder = new ethers.Wallet(config.governance.funder, getProvider());
  const pending = await Issuer.find({ onChain: false });
  console.log(`found ${pending.length} pending issuer(s)`);

  for (const iss of pending) {
    try {
      const w = new ethers.Wallet(decryptKey(iss.encPrivateKey), getProvider());
      const bal = await getProvider().getBalance(w.address);
      const send = bal - ethers.parseEther("0.0003");
      if (send > 0n) {
        await (await w.sendTransaction({
          to: funder.address, value: send,
          maxFeePerGas: ethers.parseUnits("6", "gwei"),
          maxPriorityFeePerGas: ethers.parseUnits("1.2", "gwei"),
        })).wait();
        console.log(`swept ${ethers.formatEther(send)} ETH from ${iss.institution} -> funder`);
      }
    } catch (e) {
      console.log(`sweep skipped for ${iss.institution}: ${e.message}`);
    }
    await User.deleteMany({ issuer: iss._id });
    await Issuer.deleteOne({ _id: iss._id });
    console.log(`removed pending issuer: ${iss.institution} (${iss.walletAddress})`);
  }

  console.log("funder now:", ethers.formatEther(await getProvider().getBalance(funder.address)), "ETH");
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
