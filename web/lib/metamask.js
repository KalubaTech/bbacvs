// MetaMask client — the institution signs the on-chain anchoring transaction itself
// (proposal Figure 3.3: "blockchain tx signed with issuer private key (MetaMask)").
import { ethers } from "ethers";

const SEPOLIA_HEX = "0xaa36a7"; // 11155111
const REGISTRY_ABI = ["function issueCredential(bytes32 credentialHash, bytes32 cidHash)"];

export function hasMetaMask() {
  return typeof window !== "undefined" && !!window.ethereum;
}

export async function currentAddress() {
  if (!hasMetaMask()) return null;
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  return accounts[0] ? ethers.getAddress(accounts[0]) : null;
}

export async function ensureSepolia() {
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId === SEPOLIA_HEX) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_HEX }],
    });
  } catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: SEPOLIA_HEX,
          chainName: "Sepolia test network",
          nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://rpc.sepolia.org"],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        }],
      });
    } else throw e;
  }
}

export async function connectWallet() {
  if (!hasMetaMask()) throw new Error("MetaMask not found — install the MetaMask browser extension.");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  await ensureSepolia();
  return ethers.getAddress(accounts[0]);
}

/** Sign + send issueCredential(hash, cidHash) from the connected MetaMask account. */
export async function anchorCredential(registryAddress, credentialHash, cidHash) {
  await ensureSepolia();
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);
  const tx = await contract.issueCredential(credentialHash, cidHash);
  const receipt = await tx.wait();
  return receipt.hash;
}

// GovernanceSafe co-signing (D09). Reads the proposal straight from the chain through the
// wallet's own provider — the co-signer sees what the Safe will execute, not what the BBACVS
// database claims — then confirms with the co-signer's key, which never leaves MetaMask.
const SAFE_ABI = [
  "function transactions(uint256) view returns (address to, uint256 value, bytes data, bool executed, uint256 confirmations)",
  "function isOwner(address) view returns (bool)",
  "function confirmed(uint256, address) view returns (bool)",
  "function confirmTransaction(uint256 txId)",
];
const GRANT_ABI = ["function grantIssuerRole(address account, bytes32 did, bytes32 institution)"];

export async function readSafeProposal(safeAddress, safeTxId, account) {
  await ensureSepolia();
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, new ethers.BrowserProvider(window.ethereum));
  const t = await safe.transactions(safeTxId);
  let call = null;
  try {
    const parsed = new ethers.Interface(GRANT_ABI).parseTransaction({ data: t.data });
    call = { method: parsed.name, account: parsed.args[0], institution: ethers.decodeBytes32String(parsed.args[2]) };
  } catch { /* not an issuer grant */ }
  return {
    to: t.to, executed: t.executed, confirmations: Number(t.confirmations), call,
    isOwner: account ? await safe.isOwner(account) : false,
    youConfirmed: account ? await safe.confirmed(safeTxId, account) : false,
  };
}

export async function cosignSafeProposal(safeAddress, safeTxId) {
  await ensureSepolia();
  const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, signer);
  const receipt = await (await safe.confirmTransaction(safeTxId)).wait();
  return receipt.hash;
}
