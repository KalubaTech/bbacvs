// Bridge to the authoritative on-chain layer (Tier 3). Read-only verification is zero-gas
// (eth_call). Writes: issuer registration goes through the 2-of-3 GovernanceSafe; credential
// anchoring/revocation are signed by the specific issuer's key (dynamic, per-institution).
import { ethers } from "ethers";
import { config } from "../config/index.js";

const CREDENTIAL_REGISTRY_ABI = [
  "function verifyCredential(bytes32 credentialHash) view returns (uint8 status, tuple(address issuer, uint64 issuedAt, uint32 _gap, bytes32 cidHash, bytes32 issuerDID) cred)",
  "function getCredential(bytes32 credentialHash) view returns (tuple(address issuer, uint64 issuedAt, uint32 _gap, bytes32 cidHash, bytes32 issuerDID))",
  "function issueCredential(bytes32 credentialHash, bytes32 cidHash)",
  "event CredentialIssued(bytes32 indexed credentialHash, address indexed issuer, bytes32 cidHash, uint64 timestamp)",
];
const ISSUER_REGISTRY_ABI = [
  "function grantIssuerRole(address account, bytes32 did, bytes32 institution)",
  "function isAuthorised(address account) view returns (bool)",
];
const GOVERNANCE_SAFE_ABI = [
  "function proposeTransaction(address to, uint256 value, bytes data) returns (uint256)",
  "function confirmTransaction(uint256 txId)",
  "function transactionCount() view returns (uint256)",
];
const REVOCATION_REGISTRY_ABI = [
  "function revoke(bytes32 credentialHash, uint8 code)",
  "function reissue(bytes32 oldHash, bytes32 newHash)",
  "function isRevoked(bytes32 credentialHash) view returns (bool)",
];

export const STATUS = ["NOT_FOUND", "VERIFIED", "REVOKED", "UNKNOWN_ISSUER"];

let provider = null;
export function getProvider() {
  if (!provider) provider = new ethers.JsonRpcProvider(config.chain.rpcUrl);
  return provider;
}

// Set an explicit gasLimit (fees are left to ethers, priced from live network conditions so
// transactions actually get mined).
const withGas = (gasLimit) => ({ gasLimit });

// Contract calls: estimate + 30% headroom, falling back to a fixed ceiling when estimation
// fails (e.g. a low-balance account). Fixed limits alone broke issuance once Sepolia repriced
// storage access — an anchor went from ~107k gas (Sept 2026) to ~378k (Oct 2026).
async function gasFor(method, args, fallback) {
  try {
    const estimate = await method.estimateGas(...args);
    return withGas((estimate * 13n) / 10n);
  } catch {
    return withGas(fallback);
  }
}

function credReg(signerOrProvider) {
  return new ethers.Contract(config.chain.credentialRegistry, CREDENTIAL_REGISTRY_ABI, signerOrProvider);
}

/** Encode an institution string into bytes32 (truncates to 31 bytes for the on-chain tag). */
function toBytes32Str(s) {
  return ethers.encodeBytes32String(String(s).slice(0, 31));
}

// ---- read-only verification ------------------------------------------------
export async function verifyOnChain(credentialHash) {
  const [status, cred] = await credReg(getProvider()).verifyCredential(credentialHash);
  return {
    status: STATUS[Number(status)] || "NOT_FOUND",
    issuer: cred.issuer,
    issuedAt: Number(cred.issuedAt),
    cidHash: cred.cidHash,
    issuerDID: cred.issuerDID,
  };
}

// ---- issuer registration via 2-of-3 GovernanceSafe -------------------------
export async function registerIssuerOnChain(issuerAddress, didString, institution) {
  if (!config.governance.signer1 || !config.governance.signer2) {
    throw new Error("Governance signer keys not configured");
  }
  const s1 = new ethers.Wallet(config.governance.signer1, getProvider());
  const s2 = new ethers.Wallet(config.governance.signer2, getProvider());
  const funder = new ethers.Wallet(config.governance.funder || config.governance.signer1, getProvider());

  // Fund the new issuer with a little gas so it can anchor credentials later.
  // Kept small — each anchor costs ~0.0002 ETH on Sepolia.
  const bal = await getProvider().getBalance(issuerAddress);
  if (bal < ethers.parseEther("0.003")) {
    // Enough for several self-signed (MetaMask) anchoring transactions.
    await (await funder.sendTransaction({ to: issuerAddress, value: ethers.parseEther("0.006"), ...withGas(21000) })).wait();
  }
  // Ensure signer2 has gas to confirm.
  if ((await getProvider().getBalance(s2.address)) < ethers.parseEther("0.0006")) {
    await (await funder.sendTransaction({ to: s2.address, value: ethers.parseEther("0.001"), ...withGas(21000) })).wait();
  }

  const issuerRegistry = new ethers.Contract(config.chain.issuerRegistry, ISSUER_REGISTRY_ABI, s1);
  const did = ethers.keccak256(ethers.toUtf8Bytes(didString));
  const data = issuerRegistry.interface.encodeFunctionData("grantIssuerRole", [
    issuerAddress, did, toBytes32Str(institution),
  ]);

  const safe1 = new ethers.Contract(config.chain.governanceSafe, GOVERNANCE_SAFE_ABI, s1);
  const safe2 = new ethers.Contract(config.chain.governanceSafe, GOVERNANCE_SAFE_ABI, s2);
  const txId = await safe1.transactionCount();
  const proposeArgs = [config.chain.issuerRegistry, 0, data];
  await (await safe1.proposeTransaction(...proposeArgs, await gasFor(safe1.proposeTransaction, proposeArgs, 600000))).wait();
  // Executes grantIssuerRole at threshold 2.
  const confirmReceipt = await (await safe2.confirmTransaction(txId, await gasFor(safe2.confirmTransaction, [txId], 800000))).wait();

  const authorised = await issuerRegistry.isAuthorised(issuerAddress);
  return { txHash: confirmReceipt.hash, authorised };
}

export async function isIssuerAuthorised(issuerAddress) {
  const reg = new ethers.Contract(config.chain.issuerRegistry, ISSUER_REGISTRY_ABI, getProvider());
  return reg.isAuthorised(issuerAddress);
}

// ---- credential anchoring / revocation (per-issuer key) --------------------
export async function anchorCredentialAs(issuerPrivKey, credentialHash, cidHash) {
  const signer = new ethers.Wallet(issuerPrivKey, getProvider());
  const reg = credReg(signer);
  const tx = await reg.issueCredential(credentialHash, cidHash, await gasFor(reg.issueCredential, [credentialHash, cidHash], 600000));
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

export async function revokeCredentialAs(issuerPrivKey, credentialHash, reasonCode) {
  const signer = new ethers.Wallet(issuerPrivKey, getProvider());
  const rev = new ethers.Contract(config.chain.revocationRegistry, REVOCATION_REGISTRY_ABI, signer);
  const receipt = await (await rev.revoke(credentialHash, reasonCode, await gasFor(rev.revoke, [credentialHash, reasonCode], 400000))).wait();
  return { txHash: receipt.hash };
}

export async function reissueCredentialAs(issuerPrivKey, oldHash, newHash) {
  const signer = new ethers.Wallet(issuerPrivKey, getProvider());
  const rev = new ethers.Contract(config.chain.revocationRegistry, REVOCATION_REGISTRY_ABI, signer);
  const receipt = await (await rev.reissue(oldHash, newHash, await gasFor(rev.reissue, [oldHash, newHash], 500000))).wait();
  return { txHash: receipt.hash };
}

// ---- audit -----------------------------------------------------------------
export async function getIssuanceEvents(fromBlock = 0) {
  const c = credReg(getProvider());
  const events = await c.queryFilter(c.filters.CredentialIssued(), fromBlock, "latest");
  return events.map((e) => ({
    credentialHash: e.args.credentialHash,
    issuer: e.args.issuer,
    cidHash: e.args.cidHash,
    timestamp: Number(e.args.timestamp),
    txHash: e.transactionHash,
    blockNumber: e.blockNumber,
  }));
}
