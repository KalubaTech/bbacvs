# BBACVS data flow and on-chain storage

As-built description of where each piece of data lives and which steps write to
Ethereum. Companion to [architecture.md](architecture.md). Written 2026-09-15.

## 1. The three stores

| Store | Role | Holds |
|-------|------|-------|
| **Ethereum Sepolia** (chain id 11155111) | Authoritative | Authorised issuer addresses and DIDs; SHA-256 hash of every credential; keccak hash of its IPFS CID; issuer address and block timestamp; revocations with reason code |
| **IPFS via Pinata** | Decentralised store | The signed W3C VC, AES-256-GCM encrypted; uploaded accreditation and evidence documents |
| **MongoDB** (local, db `bbacvs`) | Non-authoritative index | Accounts and roles; institutions incl. AES-encrypted signing keys; `credentialindexes` (names, qualification, year, CID, QR payload, anchor tx); ZAQA validation state, suspensions, disputes, applications, billing; append-only `events[]` per record |

Every write goes through the API (`api/`). Portals never contact the chain
directly except in MetaMask mode, where the institution's browser sends the
anchoring transaction. Deleting MongoDB loses names and workflow state but no
credential becomes unverifiable; the index is rebuildable from
`CredentialIssued` events plus IPFS.

Contract addresses are in `contracts/deployments.sepolia.json`:

| Contract | Writes happen when |
|----------|--------------------|
| GovernanceSafe | A regulator approves an institution (propose, confirm, auto-execute at 2 of 3) |
| IssuerRegistry | Executed by the Safe: `grantIssuerRole` / `revokeIssuerRole` |
| CredentialRegistry | Every issuance and every corrected reissue |
| RevocationRegistry | Institution or ZAQA revokes; supersession sets reason 1 and links the new hash |

## 2. Authorising an institution

`services/issuerRegistration.service.js` → `services/web3.service.js`

1. HEA / TEVETA / ECZ approve the institution in their portal (or admin registers it directly).
2. API creates a wallet, AES-encrypts the private key (`keystore.service.js`), saves the
   `Issuer` with `onChain: false` so a failed chain step can be retried.
3. Funder wallet (ZAQA) sends test ETH to the new issuer wallet for gas.
4. Governance signer 1 calls `GovernanceSafe.proposeTransaction(IssuerRegistry, grantIssuerRole(address, keccak(did), name))`.
5. Governance signer 2 calls `confirmTransaction(txId)`; threshold 2 is reached and the
   Safe executes the call. `IssuerRoleGranted` is emitted.
6. API reads `isAuthorised(address)`; on `true` sets `Issuer.onChain = true` and stores `registrationTx`.

Per-issuer on-chain fields: `did` (bytes32 keccak of `did:ethr:0x…`), `institution`
(bytes32, name truncated to 31 bytes), `registeredAt`, `active`.

Signing modes: **server** (API key anchors and signs), **metamask** (institution's
MetaMask address receives the role and anchors; API signs the VC/QR with a
separate server-held key).

## 3. Issuing a credential

`services/issuance.service.js` (`prepareCredential`, `indexCredential`), used by
`/api/credentials/issue`, `/prepare` + `/finalize`, ECZ issuance, and
`/api/applications/:id/verify-issue`.

```
claims ──▶ W3C VC ──sign(secp256k1)──▶ signed VC ──SHA-256──▶ credentialHash ─┐
                                          │                                       │
                                          └─AES-256-GCM──▶ ciphertext ──pin──▶ CID │
                                                                        │         │
                                                                   keccak256      │
                                                                        ▼         ▼
                                           CredentialRegistry.issueCredential(credentialHash, cidHash)
```

1. **Gates**: institution must be regulator-approved; qualification must match an
   accredited programme where a programme register exists; duplicate (same person,
   programme, year) → 409; in-memory lock blocks concurrent double issuance.
2. **Build VC** (`vc.service.buildCredential`): issuer DID, holder DID (existing graduate
   account's DID or a fresh `did:ethr`), claims.
3. **Sign** (`signCredential`): `EcdsaSecp256k1Signature2019` proof with the issuer's decrypted key.
4. **Hash**: `sha256(JSON.stringify(signedVC))` → `credentialHash` (`0x` + 64 hex).
5. **Encrypt + pin**: `aesEncrypt` (server key, random 12-byte IV) → Pinata `upload.json` →
   CID. `cidHash = keccak256(utf8(CID))`.
6. **Anchor**:
   - server mode: API signs `issueCredential(credentialHash, cidHash)` with the issuer
     wallet (gasLimit 160k) and waits for the receipt;
   - MetaMask mode: `POST /prepare` returns hash, cidHash and the contract address, the
     browser sends the tx, `POST /finalize` re-reads the chain and only activates the
     record when `verifyCredential` already returns VERIFIED.
7. **Index + deliver**: `credentialindexes` row with `status: active` (or `pending` until
   finalised), `anchorTx`, `qrPayload`; PDF with the signed QR from the graduate portal.

Signed QR (`signedQr.service.js`): `cred_did, cid, hash8, iss_pk_ref, iat, sig` where
`sig` is a secp256k1 signature over `cred_did|cid|hash8|iss_pk_ref|iat`; the full
`hash` is appended for the online path.

## 4. The on-chain credential record

`CredentialRegistry._credentials[credentialHash]`:

| Field | Type | Set by | Meaning |
|-------|------|--------|---------|
| `issuer` | address | `msg.sender` | Wallet that anchored; must hold ISSUER_ROLE at that moment |
| `issuedAt` | uint64 | `block.timestamp` | Anchoring time |
| `cidHash` | bytes32 | API | keccak256 of the IPFS CID |
| `issuerDID` | bytes32 | IssuerRegistry | Copied at issue time; later DID changes cannot rewrite history |

A hash can be anchored once (`already issued` revert). No PII is stored.
Revocation is a separate `RevocationRegistry` row (reason 1–5, timestamp, revoker,
optional `supersededBy`). `verifyCredential` is a zero-gas view returning
`NotFound / Verified / Revoked / UnknownIssuer`.

Approximate Sepolia cost: ~0.01 ETH per institution registration, ~0.002 per anchor.

## 5. Validation and lifecycle

On-chain track: `Anchored (VERIFIED)` → `revoke(code)` → `REVOKED` → (supersede) new
hash anchored. Loss of ISSUER_ROLE makes every credential of that issuer answer
`UNKNOWN_ISSUER`.

Off-chain ZAQA track (`CredentialIndex.zaqaValidation`):
`draft → pending → validated | rejected | suspicious | suspended | under_dispute`.
`validated` mints `zaqaRef = ZAQA/{year}/{hash8}`. Every transition appends an
`events[]` entry. `validationEngine.service.js` re-runs its checks on each decision and
blocks one-click validation on a critical failure.

A ZAQA revocation is on-chain: `POST /api/zaqa/validation/:hash/revoke` signs
`RevocationRegistry.revoke` with the custodied issuer key. Corrections never edit the
old record: a new credential is issued, the old hash revoked with reason 1, and
both index rows linked (`supersededBy` / `supersedes`). Suspension is off-chain only
(anchor stays VERIFIED; certificate download blocked).

## 6. Verification

**Online** `GET /api/verify/:hash` (public): `eth_call verifyCredential` decides the
headline; the index adds names (NRC masked), ZAQA state and issuer standing;
`displayStatus` = on-chain result if not VERIFIED, else the ZAQA state; a
`verificationlogs` row is written. The response contains no hashes for the verifier.

**Offline**: the browser (`web/lib/offline.js`) checks the QR's secp256k1 signature
against issuer public keys cached from `GET /api/verify/issuer-keys`. Proves issuer and
integrity; revocation needs a later online re-check.

**ZAQA verification certificate** `GET /api/verify/:hash/certificate`: only when
on-chain VERIFIED and `zaqaValidation === "validated"`; prints no hash/CID/wallet; a
second QR signed with ZAQA's key (`did:zaqa#keys-1`) carries the technical data.

## 7. Field-by-field map

| Data | Chain | IPFS | Index |
|------|:-----:|:----:|:-----:|
| Credential hash | ✓ (authoritative) | | ✓ (+QR) |
| IPFS CID | keccak only | | ✓ (+QR) |
| Signed VC document | | ✓ (encrypted) | |
| Issuer wallet, DID, authorisation | ✓ | | mirror (`onChain`, `registrationTx`) |
| Issuer signing private key | | | ✓ (AES-encrypted) |
| Graduate name, NRC, qualification, year, ZQF level | | ✓ (encrypted) | ✓ |
| Revocation, supersession link | ✓ | | ✓ |
| ZAQA validation state, ref, validation report | | | ✓ |
| Suspension, disputes, corrections | | | ✓ |
| Programmes, qualifications register, NQF | | | ✓ |
| Applications, evidence, accreditation docs | | ✓ (files) | ✓ (CIDs) |
| Billing, notifications, activity, verification logs | | | ✓ |

## 8. Known limits

- Server mode keeps issuer anchoring keys and both governance signer keys on the API host (prototype); production would use hardware wallets, a real Gnosis Safe and per-regulator signing.
- One server AES key encrypts every IPFS document; only BBACVS can decrypt a stored VC.
- Hashing uses `JSON.stringify`, not RFC 8785 canonical JSON.
- Online verification compares the presented hash to the chain; it does not re-fetch and decrypt the IPFS document on each check.
- Sepolia is a testnet; the contracts and flows are unchanged for mainnet or a permissioned chain.
- The duplicate-issuance lock is in memory (single API process).
