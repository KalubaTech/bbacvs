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
  "function transactions(uint256) view returns (address to, uint256 value, bytes data, bool executed, uint256 confirmations)",
  "function confirmed(uint256, address) view returns (bool)",
  "function owners(uint256) view returns (address)",
  "function threshold() view returns (uint256)",
  "event TransactionProposed(uint256 indexed txId, address indexed proposer, address to)",
];
// GovernanceSafe owners in constructor order (scripts/deploy.js): [ZAQA, ECZ, HEA].
export const SAFE_OWNER_LABELS = ["ZAQA", "ECZ", "HEA"];
const REVOCATION_REGISTRY_ABI = [
  "function revoke(bytes32 credentialHash, uint8 code)",
  "function reissue(bytes32 oldHash, bytes32 newHash)",
  "function isRevoked(bytes32 credentialHash) view returns (bool)",
];

export const STATUS = ["NOT_FOUND", "VERIFIED", "REVOKED", "UNKNOWN_ISSUER"];

let provider = null;
export function getProvider() {
  // cacheTimeout -1: no response caching. The funder and the governance proposer can be the
  // same key, and a nonce cached from the funding tx made the next tx fail ("nonce too low").
  if (!provider) provider = new ethers.JsonRpcProvider(config.chain.rpcUrl, undefined, { cacheTimeout: -1 });
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
// Two custody modes (config.governance.cosignMode, D09):
//   server   — prototype: the API holds two owner keys and proposes + confirms itself, so one
//              operator effectively controls the "2-of-3" approval.
//   external — the API holds only the proposer key (ZAQA). The grant executes only after a
//              second regulator (ECZ or HEA) confirms from a key the API never sees (MetaMask in
//              the governance portal page, or contracts/scripts/cosign.js).

/** Fund a new issuer with a little gas so it can anchor credentials later. */
async function fundIssuer(funder, issuerAddress) {
  if ((await getProvider().getBalance(issuerAddress)) < ethers.parseEther("0.003")) {
    await (await funder.sendTransaction({ to: issuerAddress, value: ethers.parseEther("0.006"), ...withGas(21000) })).wait();
  }
}

/** Calldata for IssuerRegistry.grantIssuerRole(issuer, keccak(did), institution). */
function grantCalldata(issuerAddress, didString, institution) {
  return new ethers.Interface(ISSUER_REGISTRY_ABI).encodeFunctionData("grantIssuerRole", [
    issuerAddress, ethers.keccak256(ethers.toUtf8Bytes(didString)), toBytes32Str(institution),
  ]);
}

/**
 * Propose grantIssuerRole through the GovernanceSafe as signer 1 (ZAQA). The proposal carries
 * the proposer's confirmation; it executes once one more owner confirms.
 * @returns {{ safeTxId: number, txHash: string }}
 */
export async function proposeIssuerGrant(issuerAddress, didString, institution) {
  if (!config.governance.signer1) throw new Error("Governance proposer key not configured");
  const s1 = new ethers.Wallet(config.governance.signer1, getProvider());
  const funder = new ethers.Wallet(config.governance.funder || config.governance.signer1, getProvider());
  await fundIssuer(funder, issuerAddress);

  const safe = new ethers.Contract(config.chain.governanceSafe, GOVERNANCE_SAFE_ABI, s1);
  const args = [config.chain.issuerRegistry, 0, grantCalldata(issuerAddress, didString, institution)];
  const receipt = await (await safe.proposeTransaction(...args, await gasFor(safe.proposeTransaction, args, 600000))).wait();
  // The id comes from the TransactionProposed event, not a pre-read counter (no race).
  const event = receipt.logs.map((l) => { try { return safe.interface.parseLog(l); } catch { return null; } })
    .find((e) => e?.name === "TransactionProposed");
  if (!event) throw new Error("GovernanceSafe proposal emitted no TransactionProposed event");
  return { safeTxId: Number(event.args.txId), txHash: receipt.hash };
}

/** Server-custody mode only: confirm (and thereby execute) a proposal with signer 2. */
async function confirmAsSigner2(safeTxId) {
  if (!config.governance.signer2) throw new Error("Second governance key not configured");
  const s2 = new ethers.Wallet(config.governance.signer2, getProvider());
  const funder = new ethers.Wallet(config.governance.funder || config.governance.signer1, getProvider());
  if ((await getProvider().getBalance(s2.address)) < ethers.parseEther("0.0006")) {
    await (await funder.sendTransaction({ to: s2.address, value: ethers.parseEther("0.001"), ...withGas(21000) })).wait();
  }
  const safe = new ethers.Contract(config.chain.governanceSafe, GOVERNANCE_SAFE_ABI, s2);
  return (await safe.confirmTransaction(safeTxId, await gasFor(safe.confirmTransaction, [safeTxId], 800000))).wait();
}

/** Server-custody mode: propose as signer 1 and confirm as signer 2 (executes at threshold 2). */
export async function registerIssuerOnChain(issuerAddress, didString, institution) {
  if (!config.governance.signer1 || !config.governance.signer2) {
    throw new Error("Governance signer keys not configured");
  }
  const { safeTxId } = await proposeIssuerGrant(issuerAddress, didString, institution);
  const confirmReceipt = await confirmAsSigner2(safeTxId);
  const authorised = await isIssuerAuthorised(issuerAddress);
  return { txHash: confirmReceipt.hash, authorised, safeTxId };
}

/**
 * A GovernanceSafe proposal as recorded ON-CHAIN, with the owners who confirmed it and its
 * calldata decoded (so co-signers see what they approve, not what the database says).
 */
export async function getSafeProposal(safeTxId) {
  const safe = new ethers.Contract(config.chain.governanceSafe, GOVERNANCE_SAFE_ABI, getProvider());
  const t = await safe.transactions(safeTxId);
  const owners = await Promise.all(SAFE_OWNER_LABELS.map((_, i) => safe.owners(i)));
  const confirmedBy = await Promise.all(owners.map(async (address, i) => ({
    label: SAFE_OWNER_LABELS[i], address, confirmed: await safe.confirmed(safeTxId, address),
  })));
  let call = null;
  try {
    const parsed = new ethers.Interface(ISSUER_REGISTRY_ABI).parseTransaction({ data: t.data });
    if (parsed?.name === "grantIssuerRole") {
      call = { method: "grantIssuerRole", account: parsed.args[0], institution: ethers.decodeBytes32String(parsed.args[2]) };
    }
  } catch { /* not an issuer grant */ }
  return {
    safeTxId: Number(safeTxId), to: t.to, executed: t.executed, confirmations: Number(t.confirmations),
    threshold: Number(await safe.threshold()), confirmedBy, call,
  };
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
