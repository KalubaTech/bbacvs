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
