# BBACVS remediation register — status at 23 October 2026

Companion to *BBACVS Technical Defects and Submission Action Plan* (engineering review, 20 October
2026). The review evaluated commit `0f4abb0`. Fixes are in commits **`0495f69`** (D01–D08) and
**`ae062eb`** (gas estimation, issuance date, deployment notes). Evidence files are in
[`docs/evidence/2026-10-23/`](evidence/2026-10-23/) and each one records the commit, runtime and
timestamp. All security cases use synthetic records (unit tests) or read-only calls (live checks).

"Resolved" below means that the code change, automated tests and recorded evidence all exist. It
does not mean an independent party has audited the change.

| ID | Status | What changed | Evidence |
|----|--------|--------------|----------|
| D01 | **Resolved** (contract redeployed) | `RevocationRegistry` looks up each credential's issuer in `CredentialRegistry.issuerOf` and only that issuer may revoke or reissue it. It refuses unknown credentials, credentials that are already revoked, zero or self replacements, replacements that are not yet anchored, replacements from another issuer, revoked replacements and duplicate successors. A separate `governanceRevoke` lets only the 2-of-3 GovernanceSafe make emergency revocations. Supersession now calls `reissue` on-chain, so the old→new link is recorded on the chain. | 17 new Hardhat tests (`01-contracts-hardhat-test.txt`, 31/31). Live `eth_call` on Sepolia: "ZUT revokes UNZA's credential → reverted: not credential issuer" (`05-live-negative-paths.txt`). Redeploy and migration log (`07-migration-log.txt`). |
| D02 | **Resolved** | `services/integrity.service.js`: CID commitment against the chain → IPFS fetch → AES-GCM authentication → digest recomputed per format version → issuer public key must derive to the on-chain issuer address → VC names that issuer → VC proof verifies → the displayed index fields match the signed claims. Separate outcomes are returned: `tampered`, `untrusted`, `unavailable` and `verified`, with a per-check evidence list in the response (`integrity.checks`). The ZAQA certificate is gated on the same result. | `api/test/integrity.test.js`: 10 cases, one per negative path (`02-api-node-test.txt`). All 12 production credentials pass the full chain (`07-migration-log.txt`). |
| D03 | **Resolved** (legacy QRs limited, not removed) | QR schema v2 signs the RFC 8785 canonical JSON of every field, including the full `hash`, `cid`, `typ` and `iss_pk_ref`. `POST /api/verify/qr` checks the signature with the key from the registry *before* it uses the reference. It also requires the signer to be the credential's issuer and the CID to match. Legacy v1 QRs are accepted only if the unsigned `hash` matches the signed `hash8`, and stored QRs are re-signed as v2 when they are next served. The ZAQA certificate and accreditation certificate QRs also use v2. | `api/test/qr.test.js`: every signed field is modified in turn, plus legacy tamper cases. Live: swapped hash → INVALID, foreign-issuer QR → TAMPERED, legacy swapped hash → TAMPERED (`05-live-negative-paths.txt`). |
| D04 | **Resolved** | `utils/canonicalJson.js` (RFC 8785 JCS). `credentialDigest(vc, version)`: v1 is legacy `JSON.stringify` and v2 is canonical. Each credential stores its `hashVersion`, and records without it are treated as v1. New credentials use v2. VC proofs sign canonical JSON and carry `proof.canonicalization: "JCS"`. | `api/test/canonical.test.js` (order independence, legacy order dependence, JCS edge cases). The v1 migration path is covered by `integrity.test.js` "legacy (v1 digest)". |
| D05 | **Resolved** | `services/verificationStatus.service.js` holds one ordered rule list. The headline (`displayStatus`) and the plain-language sentence come from the same resolved rule, and the response reports which rule decided (`integrity.statusRule`). | `api/test/verificationStatus.test.js`: suspended+validated, on-chain revocation vs suspension, ZAQA pending+suspension, tampered, unavailable, unknown issuer, untrusted key. |
| D06 | **Resolved** (by design, offline cannot prove revocation) | `/api/verify/issuer-keys` returns `generatedAt`, `maxAgeSeconds` (7 days) and `source`, and leaves out suspended issuers. The web verifier stores those values, shows the cached-at time, age, expiry and provenance, and reports offline results as **"Signature valid (offline)"**, or **"cached keys expired"** after expiry, with an explicit statement that revocation is not checked. `/api/verify/offline` resolves the key from the registry and labels a caller-supplied key as untrusted. | Code: `web/lib/offline.js`, `web/app/(portal)/verify/page.js`. Not yet covered by an automated UI test. |
| D07 | **Resolved** | `api/package.json` test script is now `node --test test/*.test.js`. | `04-d07-node-portability.txt`: on Node v22.23.4 the old command fails (0/1) and the new one passes 81/81. Node v20.20.2 passes both. |
| D08 | **Resolved** | Issuance reservations are `IssuanceReservation` rows with a unique `key` and a TTL `expiresAt`. A stale reservation is taken over, and a late release cannot delete a newer owner's row. The duplicate check runs *after* the reservation is acquired. | `api/test/issuanceReservation.test.js`: 6 separate Node processes race for one reservation and exactly one wins. Uses a throwaway MongoDB database. |
| D09 | **Open** (assurance gap) | No change. Both governance signer keys and the funder key are still in the single API environment (`api/.env`), so the platform's "2-of-3" approvals are executed by one operator. The report must not claim independent regulatory signatures. Required: separate custodians, a co-signing procedure outside the API, and documented recovery and rotation. | — |
| D10 | **Partly addressed** | VC proofs now sign canonical JSON (D04). The proof is still the project's own `EcdsaSecp256k1Signature2019`-style object, not a standard Data Integrity cryptosuite or JWT-VC. DID resolution and interoperability with an independent verifier have not been tested. | — |
| D11 | **Open** (evaluation gap) | No centralised baseline or load study has been run. One incidental measurement: verification fetches the encrypted VC from the Pinata gateway, which took 3.6–7.3 s per credential on first fetch on 2026-10-23 and about 0.27 s once cached. This is not a controlled measurement and must not be reported as one. | — |
| D12 | **Open** | No participant study has been run. Claims about user acceptance, SUS scores or fraud reduction are not supported. | — |

## Additional finding during remediation

**Anchoring had stopped working.** Every anchor until 12 September 2026 used 106,762 gas. On 23
October the same call needed about 378,000 gas on Sepolia, and the API's fixed `gasLimit: 160000`
made it revert. New issuance and revocation on the deployed system would therefore have failed
regardless of the defects above. `web3.service.js` now estimates gas with 30% headroom and falls
back to raised ceilings (`ae062eb`).

## Contract change and migration (D01)

* Retired: RevocationRegistry `0xB23E…8263` and CredentialRegistry `0x785c…B8D2`. Kept:
  GovernanceSafe `0x39ae…f990` and IssuerRegistry `0x99B4…73ED`, so issuer authorisations did not change.
* New: RevocationRegistry `0xc95Ad263e021ED2EF226B9D2C40523E3ADdBB840` and CredentialRegistry
  `0xC57BE34bcd4BdF382dB21fF9336bE7a4cc7a182f` (Sepolia block 11975438).
* `api/scripts/migrate-lifecycle.js` re-anchored all 12 historical credentials, signing as each
  credential's **original** issuer with its custodied key, and then replayed the one revocation as
  its issuer. It is idempotent and runs as a dry run unless given `--apply`.
* Consequence for the report: the on-chain `issuedAt` of migrated credentials is the migration
  time. The verifier shows the original issuance date from the index (`issuedAt`) and reports the
  chain time separately (`anchoredAt`). Each record keeps its original anchor transaction in
  `legacyAnchorTx` and has a `credential.migrated` history event.
* Limitation: a MetaMask-signing issuer has no custodied transaction key, so its credentials
  would have to be re-anchored by that issuer. None existed at migration time.

## Minimum evidence checklist (review §4)

- [x] Commit hash, date and lockfiles: `ae062eb8d08f755d042cf20f7cbb84162338f17c`; `package-lock.json` is committed.
- [x] Contract and API results, including the cross-issuer abuse test and the QR tamper test (`01`, `02`, `05`).
- [x] Synthetic negative-path traces that separate tampering from unavailability, unknown issuer and revocation (`integrity.test.js`, `verificationStatus.test.js`, `05`).
- [ ] Synthetic end-to-end run on a test network covering issue → pin → anchor → public verify → suspend → revoke → correct. The production lifecycle was exercised through the migration, but no full scripted synthetic run has been recorded.
- [ ] Comparative latency/scalability datasets (D11).
- [ ] User-study ethics approval and data (D12).
- [ ] Report updates (Stage 8): figure placement and captions, final PDF review.
