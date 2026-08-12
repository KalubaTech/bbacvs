# Fraud Prevention & QR-Code Security Analysis

**BBACVS — Blockchain-Based Academic Credential Verification System**
Zambia University College of Technology (ZUT) · BICTE · 2026

This document analyses (a) how the BBACVS uses blockchain to prevent academic-credential
fraud, (b) the limits of that protection, and (c) the security properties and residual risks
of the cryptographically signed QR code. It is written to accompany the security discussion in
the research proposal.

---

## 1. Threat model

Academic-credential fraud takes five recurring forms. A credible system must address each:

| # | Threat | Example |
|---|--------|---------|
| T1 | **Alteration** | A genuine certificate is edited — a grade, name, or year is changed. |
| T2 | **Forgery / fabrication** | A completely fake certificate or database record is produced. |
| T3 | **Record tampering** | An insider with database write-access silently edits or deletes a record. |
| T4 | **Fake verification channel** | A fraudulent "verification" website or a bribed gatekeeper confirms a fake credential. |
| T5 | **Repudiation** | An institution denies a genuine credential, or is falsely associated with a fake one. |

Centralised, paper-based, and URL-QR systems (including current ECZ practice) are vulnerable
to most of these because trust rests on a mutable database and an institution's availability.

---

## 2. How blockchain prevents fraud

BBACVS anchors the **SHA-256 hash** of every credential, the **issuer registry**, and all
**revocations** on the Ethereum blockchain. This yields four cryptographic guarantees that map
directly onto the threats above.

### 2.1 Integrity — defeats alteration (T1)

Each issued credential is serialised, ECDSA-signed, and reduced to a **SHA-256 hash** that is
written to the `CredentialRegistry` contract. Verification **recomputes** the hash of the
presented credential and compares it byte-for-byte with the on-chain value.

- Changing a single character (a mark, a name, a graduation year) produces a completely
  different hash → the comparison fails → the credential is rejected as `TAMPERED`.
- Producing altered content that hashes to the *same* value would require defeating SHA-256,
  which is computationally infeasible under standard cryptographic assumptions.

### 2.2 Authenticity — defeats forgery (T2)

Only wallets holding **`ISSUER_ROLE`** (OpenZeppelin `AccessControl`) may anchor a credential.
That role is granted **only** through a **2-of-3 Gnosis-style multi-signature** shared by ZQA,
ECZ, and HEA — no single party can authorise an issuer.

- An attacker cannot mint a valid on-chain record without an authorised issuer's private key.
- If a credential is presented that was anchored by a wallet that is not (or is no longer)
  authorised, verification returns `UNKNOWN_ISSUER`.

### 2.3 Immutability — defeats record tampering (T3)

Once written, on-chain data cannot be altered or deleted without redoing every subsequent
block and out-voting the entire network — practically impossible. This removes the single most
dangerous centralised threat: the **insider with database write-access**. A database row can be
edited silently and without trace; a blockchain record cannot.

### 2.4 Decentralised verification — defeats fake channels (T4)

Verification is a **read-only, zero-gas** query against the **public blockchain**. Anyone — an
employer, a foreign university, a regulator — can verify **independently**, without contacting
or trusting the issuing institution. There is no central server to take offline, hack, or
corrupt, and no "verification page" whose authenticity must itself be trusted.

### 2.5 Auditability & revocation — defeats repudiation and stale credentials (T5)

- Every issuance and revocation emits a permanent **on-chain event** — an immutable audit
  trail. An institution can neither deny a genuine credential nor be falsely bound to a fake one.
- Revocations are recorded on-chain with standardised **reason codes**; a cancelled credential
  permanently returns `REVOKED` and cannot be made to appear valid again.

### Summary — threat coverage

| Threat | Mechanism | Result |
|--------|-----------|--------|
| T1 Alteration | SHA-256 hash anchoring + recompute-and-compare | Detected (`TAMPERED`) |
| T2 Forgery | `ISSUER_ROLE` gated by 2-of-3 governance | Blocked (`UNKNOWN_ISSUER`) |
| T3 Tampering | Blockchain immutability | Prevented |
| T4 Fake channel | Public, decentralised verification | Eliminated |
| T5 Repudiation / stale | On-chain events + revocation registry | Prevented (`REVOKED`) |

---

## 3. What blockchain does *not* prevent

Intellectual honesty strengthens the work. Blockchain guarantees that a record is **authentic,
unaltered, and issued by an authorised party** — it does **not** guarantee that the underlying
claim is *true*.

- **"Garbage in" fraud.** If a *legitimate* institution issues a false credential — through a
  corrupt insider or a **compromised issuer private key** — the blockchain will faithfully
  record it as valid. The ledger secures the record, not the honesty of the issuer.
  *Mitigations:* 2-of-3 governance for issuer admission, secure key custody (HSM/KMS in
  production), and on-chain revocation once fraud is discovered.
- **Identity binding.** The chain proves the *credential* is genuine; it does not prove the
  *person presenting it* is its subject. This is addressed at verification time (§4) and via
  the holder's DID, not by the ledger.
- **Off-chain data trust.** Only on-chain data is immutable. BBACVS therefore stores the full
  credential **encrypted (AES-256-GCM) on IPFS** — content-addressed and tamper-evident — and
  keeps MongoDB strictly as a **non-authoritative** cache, avoiding the "tamper-proof claim over
  a mutable database" contradiction found in prior systems.

---

## 4. QR-code security analysis

The classic QR weakness is that a QR is *opaque* and often encodes a **URL**, making it
**clonable** and a **phishing** vector — and dependent on a central server being online. BBACVS
replaces this with a **cryptographically signed QR**: a 6-field JSON payload
(`cred_did`, `cid`, `hash8`, `iss_pk_ref`, `iat`, `sig`) where `sig` is an **ECDSA (secp256k1)**
signature by the issuer over the payload.

### 4.1 What the signed QR design defeats

| QR risk | Outcome in BBACVS |
|---------|-------------------|
| **Tampering** with QR contents | Any change to a field invalidates the ECDSA signature → rejected. |
| **Counterfeit QR** for a fake credential | Requires the issuer's private key to forge a valid signature → infeasible. |
| **Phishing** (malicious URL) | The QR encodes *signed data*, not a URL — scanning it cannot redirect a user to a malicious site. |
| **Central-server dependency** | The signature enables **offline** validation against cached issuer keys — no server needed at verify time. |

### 4.2 Residual risks and mitigations

The signed QR makes the *credential* practically impossible to forge or alter. The risks that
remain are inherent to any *presentable token* — most importantly, binding it to the right person.

| # | Residual risk | Explanation | Mitigation |
|---|---------------|-------------|-----------|
| R1 | **Cloning / impersonation** | A QR can be photographed and reused. A copy still verifies as the *genuine* credential — so the risk is presenting *someone else's* real credential as one's own. The QR proves the credential is real, **not** that the presenter is its subject. | Verifier checks the **chain-returned name/qualification** against the person + photo ID; for high assurance, require the holder to prove control of their DID key, or use a one-time challenge. |
| R2 | **Valid QR on a forged document** | A real QR pasted onto a fake paper certificate. | Trust the **scanned/resolved** details from the chain, not the printed text — the forgery's printed claims won't match. This is a strength, not a weakness, of QR verification. |
| R3 | **Offline mode misses revocation** | Offline validation confirms signature + integrity but cannot see on-chain revocation. A revoked credential could pass an offline check. | Offline results are **provisional**; the verifier app re-checks online when connectivity returns (by design). |
| R4 | **No freshness / replay window** | The QR is static and can be reused indefinitely (reinforces R1). | Optional expiring or challenge-response presentation for sensitive contexts. |
| R5 | **Minor metadata exposure** | The QR reveals the IPFS CID and DIDs. | It carries **no plaintext personal data**; the credential itself is AES-256-GCM encrypted on IPFS and cannot be decrypted from the QR. |

### 4.3 Verification best practice

To close R1/R2, a verifier should always:
1. Verify the QR (online against the chain, or offline against cached keys).
2. Read the **name, qualification, and institution returned by the system** (not the paper).
3. Confirm those details match the person and their photo ID.
4. Where connectivity allows, prefer **online** verification so revocation status is current.

---

## 5. Conclusion

Blockchain gives BBACVS strong, cryptographically enforced protection against the dominant
fraud vectors — alteration, forgery, silent tampering, fake verification channels, and
repudiation — by anchoring credential hashes, gating issuance behind multi-signature
governance, and enabling independent public verification. Its limits are equally clear: it
secures the *record*, not the *truthfulness of the issuer*, and not the *identity of the
presenter*. The signed QR extends these guarantees to a practical, offline-capable artefact
while eliminating the cloning-and-phishing weaknesses of URL-based QR codes; its residual risk
is holder-binding, which is handled at the point of verification rather than by the token itself.

*See also:* [architecture.md](architecture.md) (trust hierarchy, signed-QR payload),
[DOCUMENTATION.md §9](DOCUMENTATION.md#9-security-model) (ten-layer security model).
