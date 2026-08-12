// W3C Verifiable Credentials (VCDM 1.1) + DID (did:ethr). Security layer L2.
// Constructs and ECDSA-signs JSON-LD VCs so credentials interoperate with SSI ecosystems.
//
// NOTE: this signs with a self-contained secp256k1 proof (EcdsaSecp256k1Signature2019-style)
// rather than a full Veramo JWT VC. Swapping in a Veramo agent (KeyManager + did:ethr +
// CredentialPlugin) is a drop-in refinement that keeps buildCredential/signCredential shapes.
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 as nobleSha256 } from "@noble/hashes/sha256";
import { utf8ToBytes } from "@noble/hashes/utils";

/**
 * Build an unsigned W3C VC for an academic credential.
 * @param {object} params issuerDID, holderDID, claims (name, qualification, gradYear...)
 */
export function buildCredential({ issuerDID, holderDID, claims }) {
  return {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://www.w3.org/2018/credentials/examples/v1",
    ],
    type: ["VerifiableCredential", "AcademicCredential"],
    issuer: { id: issuerDID },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: holderDID,
      ...claims,
    },
  };
}

/**
 * Sign a VC with the issuer's secp256k1 key, attaching a W3C `proof` block.
 * @param {object} vc unsigned credential from buildCredential()
 * @param {string} issuerPrivKeyHex issuer secp256k1 private key (hex, 0x optional)
 * @param {string} issuerDID did:ethr of the issuer
 * @returns {object} signed VC
 */
export function signCredential(vc, issuerPrivKeyHex, issuerDID) {
  const digest = nobleSha256(utf8ToBytes(JSON.stringify(vc)));
  const sig = secp256k1.sign(digest, issuerPrivKeyHex.replace(/^0x/, ""));
  return {
    ...vc,
    proof: {
      type: "EcdsaSecp256k1Signature2019",
      created: new Date().toISOString(),
      proofPurpose: "assertionMethod",
      verificationMethod: `${issuerDID}#keys-1`,
      signatureValue: "0x" + sig.toDERHex(),
    },
  };
}

/** Verify a signed VC's proof against an issuer public key (hex). */
export function verifyCredential(signedVC, issuerPubKeyHex) {
  try {
    const { proof, ...vc } = signedVC;
    const digest = nobleSha256(utf8ToBytes(JSON.stringify(vc)));
    const sig = proof.signatureValue.replace(/^0x/, "");
    return secp256k1.verify(sig, digest, issuerPubKeyHex.replace(/^0x/, ""));
  } catch {
    return false;
  }
}
