// Shared institution-onboarding logic used by the HEA portal (higher-ed institutions) and
// by the ECZ/admin seeding paths. Generates a signing wallet, persists the issuer + a login
// account for its officer, then authorises it on-chain via the 2-of-3 GovernanceSafe.
import { ethers } from "ethers";
import { User, Issuer } from "../models/index.js";
import { hashPassword } from "../middleware/auth.js";
import { encryptKey } from "./keystore.service.js";
import { publicKeyFor } from "./signedQr.service.js";
import { registerIssuerOnChain } from "./web3.service.js";

/**
 * Onboard an institution and create its officer login.
 *
 * When `authorizeOnChain` is true (admin/HEA direct registration), the issuer is authorised
 * on-chain immediately. When false (self-service registration), it is stored pending and
 * on-chain authorisation happens later at approval via {@link authorizeIssuerOnChain}.
 *
 * @returns {{ issuer, officer }} created records (issuer is the mongoose doc).
 * @throws Error with `.status` set (409) on duplicate email/wallet.
 */
export async function registerInstitution({
  institution,
  officerEmail,
  officerPassword,
  officerName,
  metamaskAddress,
  sector = "higher_ed",
  heaStatus = "approved", // direct registrations are recognised immediately; self-service = "pending"
  zaqaTrusted = false,
  officerRole = "issuer",
  authorizeOnChain = true,
  selfRegistered = false,
  accreditation = null, // { cid, name, mime }
}) {
  if (await User.findOne({ email: officerEmail.toLowerCase() })) {
    const e = new Error("Officer email already in use");
    e.status = 409;
    throw e;
  }

  const metamask = !!metamaskAddress;
  // The Crypto Engine key (server-held) signs the VC + QR proof in both modes.
  const signingKey = ethers.Wallet.createRandom();
  // On-chain issuer identity: the institution's MetaMask account (they anchor), else the server key.
  const onchainAddress = metamask ? ethers.getAddress(metamaskAddress) : signingKey.address;
  const did = `did:ethr:${onchainAddress}`;

  if (metamask && (await Issuer.findOne({ walletAddress: onchainAddress }))) {
    const e = new Error("That wallet address is already an issuer");
    e.status = 409;
    throw e;
  }

  // Persist FIRST (onChain:false) so an on-chain failure never orphans funds and is retryable.
  const issuer = await Issuer.create({
    institution,
    did,
    walletAddress: onchainAddress,
    encPrivateKey: encryptKey(signingKey.privateKey),
    publicKey: publicKeyFor(signingKey.privateKey),
    signingMode: metamask ? "metamask" : "server",
    onChain: false,
    sector,
    heaStatus,
    zaqaTrusted,
    selfRegistered,
    accreditationCid: accreditation?.cid,
    accreditationName: accreditation?.name,
    accreditationMime: accreditation?.mime,
  });
  const officer = await User.create({
    email: officerEmail,
    name: officerName,
    role: officerRole,
    passwordHash: await hashPassword(officerPassword),
    issuer: issuer._id,
  });

  let registrationTx = null;
  if (authorizeOnChain) {
    const onchain = await authorizeIssuerOnChain(issuer);
    registrationTx = onchain.txHash;
  }

  return { issuer, officer, registrationTx };
}

/**
 * Authorise an already-stored issuer on-chain via the 2-of-3 GovernanceSafe (also funds the
 * address with gas for MetaMask issuers). Idempotent-ish: safe to call once at approval time.
 * @returns {{ txHash, authorised }}
 */
export async function authorizeIssuerOnChain(issuer) {
  const onchain = await registerIssuerOnChain(issuer.walletAddress, issuer.did, issuer.institution);
  issuer.onChain = onchain.authorised;
  issuer.registrationTx = onchain.txHash;
  await issuer.save();
  return onchain;
}
