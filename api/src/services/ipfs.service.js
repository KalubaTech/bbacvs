// Decentralised off-chain store (Tier 3). Pins AES-256-GCM encrypted VC payloads to IPFS
// via Pinata and returns the content-addressed CID. Only the CID hash is anchored on-chain.
import { config } from "../config/index.js";

// TODO(Sprint 2): wire pinata-web3 SDK. Lazy import keeps the dep optional in dev.
let pinataClient = null;
async function client() {
  if (pinataClient) return pinataClient;
  const { PinataSDK } = await import("pinata-web3");
  pinataClient = new PinataSDK({
    pinataJwt: config.ipfs.pinataJwt,
    pinataGateway: config.ipfs.gateway,
  });
  return pinataClient;
}

/**
 * Pin an encrypted credential payload to IPFS.
 * @param {object} encrypted output of crypto.aesEncrypt()
 * @returns {Promise<string>} CID
 */
export async function pin(encrypted) {
  const pinata = await client();
  const { IpfsHash } = await pinata.upload.json(encrypted);
  return IpfsHash;
}

/**
 * Fetch an encrypted payload by CID (online verification path).
 * @param {string} cid
 */
export async function fetchByCid(cid) {
  const pinata = await client();
  const { data } = await pinata.gateways.get(cid);
  return data;
}
