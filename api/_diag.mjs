import { Issuer } from "./src/models/index.js";
import { connectDB } from "./src/models/index.js";
import { decryptKey } from "./src/services/keystore.service.js";
import { buildCredential, signCredential } from "./src/services/vc.service.js";
import { sha256 } from "./src/services/crypto.service.js";
import { anchorCredentialAs, verifyOnChain } from "./src/services/web3.service.js";
import mongoose from "mongoose";
import { ethers } from "ethers";

await connectDB();
const issuer = await Issuer.findOne({ institution: "UNZA" });
const priv = decryptKey(issuer.encPrivateKey);
const vc = buildCredential({ issuerDID: issuer.did, holderDID: "did:ethr:0x"+"e".repeat(40), claims: { name: "Diag", qualification: "X", graduationYear: 2024 } });
const signed = signCredential(vc, priv, issuer.did);
const credHash = sha256(signed);
console.log("credHash:", credHash);
const onchain = await verifyOnChain(credHash);
console.log("current on-chain status of this hash:", onchain.status);
const cidHash = ethers.keccak256(ethers.toUtf8Bytes("QmDiagCid"));
try {
  const r = await anchorCredentialAs(priv, credHash, cidHash);
  console.log("ANCHOR OK:", r.txHash);
} catch (e) {
  console.log("ANCHOR FAILED:", e.shortMessage || e.message);
  console.log("code:", e.code);
}
await mongoose.disconnect();
