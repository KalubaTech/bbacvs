// Issuer authorisation through the 2-of-3 GovernanceSafe, in either custody mode (D09).
// `chain` is injectable so the workflow can be tested without a network.
import { config } from "../config/index.js";
import { Issuer } from "../models/index.js";
import * as web3 from "./web3.service.js";
import { pushEvent } from "./history.service.js";

const defaultChain = {
  registerIssuerOnChain: web3.registerIssuerOnChain,
  proposeIssuerGrant: web3.proposeIssuerGrant,
  isIssuerAuthorised: web3.isIssuerAuthorised,
};

export const cosignMode = () => config.governance.cosignMode;

/**
 * Authorise a stored issuer on-chain.
 *   server mode   → propose + confirm now; returns { authorised, txHash }.
 *   external mode → propose as ZAQA (once) and wait for a second regulator's co-signature;
 *                   returns { pending: true, safeTxId }.
 */
export async function requestIssuerAuthorisation(issuer, { chain = defaultChain, mode = cosignMode() } = {}) {
  if (issuer.onChain) return { authorised: true, txHash: issuer.registrationTx };

  if (mode === "server") {
    const onchain = await chain.registerIssuerOnChain(issuer.walletAddress, issuer.did, issuer.institution);
    issuer.onChain = onchain.authorised;
    issuer.registrationTx = onchain.txHash;
    await issuer.save();
    return { authorised: onchain.authorised, txHash: onchain.txHash };
  }

  // External custody: never stack a second proposal on one that is still open.
  if (issuer.governanceProposal?.status === "awaiting_cosign") {
    await syncIssuerProposal(issuer, { chain });
    return issuer.onChain
      ? { authorised: true }
      : { pending: true, safeTxId: issuer.governanceProposal.safeTxId };
  }
  const { safeTxId, txHash } = await chain.proposeIssuerGrant(issuer.walletAddress, issuer.did, issuer.institution);
  issuer.governanceProposal = { safeTxId, proposeTx: txHash, proposedAt: new Date(), status: "awaiting_cosign" };
  pushEvent(issuer, null, "institution.authorisation_proposed", "On-chain authorisation proposed by ZAQA; awaiting a second regulator's co-signature", { safeTxId, txHash });
  await issuer.save();
  return { pending: true, safeTxId };
}

/** Mark an issuer authorised once its co-signed proposal has executed on-chain. */
export async function syncIssuerProposal(issuer, { chain = defaultChain } = {}) {
  if (issuer.onChain || issuer.governanceProposal?.status !== "awaiting_cosign") return issuer;
  if (await chain.isIssuerAuthorised(issuer.walletAddress)) {
    issuer.onChain = true;
    issuer.governanceProposal.status = "executed";
    issuer.governanceProposal.executedAt = new Date();
    pushEvent(issuer, null, "institution.authorised_on_chain", "Co-signed by a second regulator; issuer authorised on-chain", { safeTxId: issuer.governanceProposal.safeTxId });
    await issuer.save();
  }
  return issuer;
}

/** Sync every open proposal (run periodically and when the co-signing page loads). */
export async function syncPendingProposals({ chain = defaultChain } = {}) {
  const open = await Issuer.find({ onChain: { $ne: true }, "governanceProposal.status": "awaiting_cosign" });
  for (const issuer of open) {
    try { await syncIssuerProposal(issuer, { chain }); } catch { /* RPC hiccup — next round */ }
  }
  return open.filter((i) => i.onChain).length;
}
