// Shared credential-issuance primitives: build + ECDSA-sign the W3C VC, AES-encrypt, pin to
// IPFS, build the signed QR, and write the auxiliary index row. Used by the issuer/ECZ issue
// routes AND by the digitization-application workflow so both produce identical credentials.
import { ethers } from "ethers";
import { User, CredentialIndex } from "../models/index.js";
import { decryptKey } from "./keystore.service.js";
import { buildCredential, signCredential } from "./vc.service.js";
import { sha256, hashFragment, aesEncrypt } from "./crypto.service.js";
import { pin } from "./ipfs.service.js";
import { buildSignedPayload } from "./signedQr.service.js";

// Off-chain work shared by server-anchor and MetaMask-anchor: resolve holder DID, build +
// sign the VC, encrypt, pin, and build the signed QR. Returns everything needed to anchor.
export async function prepareCredential(issuer, holderEmail, claims) {
  const issuerPriv = decryptKey(issuer.encPrivateKey);
  const holder = await User.findOne({ email: holderEmail.toLowerCase(), role: "holder" });
  const holderDID = holder?.holderDID || `did:ethr:${ethers.Wallet.createRandom().address}`;

  const signedVC = signCredential(buildCredential({ issuerDID: issuer.did, holderDID, claims }), issuerPriv, issuer.did);
  const credentialHash = sha256(signedVC);
  const cid = await pin(aesEncrypt(signedVC));
  const cidHash = ethers.keccak256(ethers.toUtf8Bytes(cid));
  const qrPayload = {
    ...buildSignedPayload(
      { cred_did: holderDID, cid, hash8: hashFragment(credentialHash),
        iss_pk_ref: `${issuer.did}#keys-1`, iat: Math.floor(Date.now() / 1000) },
      issuerPriv
    ),
    hash: credentialHash,
  };
  return { holderDID, credentialHash, cid, cidHash, qrPayload };
}

export async function indexCredential(issuer, holderEmail, claims, prep, { status, anchorTx, meta = {} }) {
  return CredentialIndex.create({
    credentialHash: prep.credentialHash, cid: prep.cid, issuer: issuer._id,
    issuerAddress: issuer.walletAddress, issuerDID: issuer.did, institution: issuer.institution,
    issuerPublicKey: issuer.publicKey, holderDID: prep.holderDID, holderEmail: holderEmail?.toLowerCase(),
    subjectName: claims.name, holderNationalId: claims.nationalId,
    qualification: claims.qualification, graduationYear: claims.graduationYear,
    zqfLevel: meta.zqfLevel, credentialType: meta.credentialType,
    qrPayload: prep.qrPayload, status, anchorTx,
  });
}
