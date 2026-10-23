# Governance key custody (defect D09)

The GovernanceSafe (`contracts/contracts/GovernanceSafe.sol`) is a 2-of-3 multi-signature wallet
with three owners, in constructor order **ZAQA, ECZ, HEA**. It is the only account that can
authorise or de-authorise issuers (IssuerRegistry admin), pause issuance (CredentialRegistry
governance) and make emergency revocations (RevocationRegistry governance).

A 2-of-3 rule protects anything only if the keys are held by different people. This document says
who holds which key, how an approval happens, and what to do when a key is lost or must change.

## Custody modes

The API supports two modes, set with `GOV_COSIGN_MODE` in `api/.env`:

| Mode | Keys in the API environment | What an approval means |
|------|-----------------------------|------------------------|
| `server` (prototype; **current production setting** on 2026-10-23) | ZAQA (`GOV_SIGNER1_PRIVATE_KEY`, also funder) **and** ECZ (`GOV_SIGNER2_PRIVATE_KEY`) | The API proposes and confirms by itself. One operator controls two of the three keys, so approvals are **not** independent regulatory signatures. The API logs a warning at start-up. |
| `external` (default when `GOV_SIGNER2_PRIVATE_KEY` is empty) | ZAQA only | The API proposes as ZAQA. The grant executes only when ECZ or HEA confirms from a key the API never sees. |

### Switching production to `external`

1. Give the ECZ and HEA owner keys to their custodians. Each custodian imports their key into their
   own MetaMask (or hardware wallet) on their own device. The keys are in
   `contracts/governance-keys.json` on the server.
2. Remove `GOV_SIGNER2_PRIVATE_KEY` from `api/.env`, set `GOV_COSIGN_MODE=external`, and restart
   `bbacvs-api.service`.
3. Delete the ECZ and HEA entries from `contracts/governance-keys.json` and from any backups on the
   server. **Until this step is done the custody is not actually split**, whatever the mode says.
4. Set `ZAQA_SIGNING_KEY` to a dedicated key so that the ZAQA certificate QR is not signed with the
   governance key.

## Approval procedure (external mode)

1. A regulator approves an institution in its portal (HEA, TEVETA or ECZ). The API funds the
   institution's wallet with gas and **proposes** `IssuerRegistry.grantIssuerRole(wallet, did,
   institution)` through the Safe as ZAQA. The institution shows as "approved, awaiting
   co-signature" and cannot issue yet.
2. The ECZ or HEA custodian opens **Governance Co-signing** (`/ecz/governance` or
   `/hea/governance`) and connects MetaMask. For each open proposal the page reads the call
   **from the chain through the custodian's own wallet** and shows the account and institution it
   grants. If the granted address differs from the institution's wallet on record, the page warns
   and refuses to co-sign.
3. The custodian checks the institution against the approval decision and clicks **Co-sign with
   MetaMask**. At the second confirmation the Safe executes the grant.
4. The API checks the chain (immediately after a portal co-signature, and every 2 minutes for
   co-signatures made elsewhere) and marks the institution as authorised.

Custodians who prefer the command line can co-sign with
`contracts/scripts/cosign.js`. Run without `CONFIRM=yes` it prints the decoded proposal and sends
nothing:

```bash
SAFE_TX_ID=<id> COSIGNER_PRIVATE_KEY=<own key> npx hardhat run scripts/cosign.js --network sepolia
SAFE_TX_ID=<id> COSIGNER_PRIVATE_KEY=<own key> CONFIRM=yes npx hardhat run scripts/cosign.js --network sepolia
```

ZAQA can see the same list read-only at `/zaqa/governance`.

## Recovery

* **One key lost or compromised.** The other two owners can still approve, because the threshold
  is 2. A compromised key on its own cannot authorise anything, but together with any single
  colluding or careless owner it can. Rotate immediately (below).
* **Two keys lost.** Governance is lost: no issuer can be authorised or de-authorised and no
  emergency revocation can be made. Existing credentials still verify. Recovery means deploying a
  new governance stack and migrating issuers and credentials, as done for D01 on 2026-10-23.
* **Backups.** Keep each owner key backed up by its own custodian, offline and separately. Never
  keep one backup that holds two or more owner keys. The server backup should hold only what the
  API needs: the ZAQA proposer/funder key and the AES key that protects issuer signing keys.

## Rotation

The prototype GovernanceSafe has **no owner-replacement function**, so an owner key cannot be
rotated in place. Rotation therefore means:

1. Deploy a new GovernanceSafe with the new owner set.
2. Using 2-of-3 of the old Safe, grant `DEFAULT_ADMIN_ROLE` on the IssuerRegistry to the new Safe,
   then renounce it for the old Safe.
3. `CredentialRegistry.governance` and `RevocationRegistry.governance` are set at deployment and
   cannot be changed. Redeploy those two with the new Safe (`contracts/scripts/redeploy-lifecycle.js`,
   adapted to take the new Safe address) and re-anchor credentials (`api/scripts/migrate-lifecycle.js`).
4. Update `GOVERNANCE_SAFE_ADDRESS` and the registry addresses in `api/.env`.

A production deployment should use an audited Safe that supports owner replacement (for example
Safe{Wallet}) so that rotation does not require a redeployment.

## Other key uses to separate

* The HEA/TEVETA accreditation-certificate QR is signed with `GOV_SIGNER2_PRIVATE_KEY` (the ECZ
  governance key), or with the ZAQA key when that is unset. A certificate-signing key should not
  be a governance owner key. Give the accrediting authorities their own signing key.
* ZAQA's key is at present the Safe owner, the gas funder, the contract deployer and (with
  `ZAQA_SIGNING_KEY` unset) the certificate-QR signer.

## Evidence

* `api/test/governance.test.js`: external mode proposes once, does not confirm its own proposal,
  and authorises the issuer only after the grant executes. Server mode is unchanged.
* `docs/evidence/2026-10-23/08-d09-cosign-rehearsal.txt`: a rehearsal on an isolated Hardhat
  chain. The API in external mode proposes, a non-owner is refused, nothing executes before the
  co-signature, the ECZ custodian co-signs with `cosign.js`, and the sync marks the issuer
  authorised.
* What this does **not** show: that real custodians hold the keys. That is an organisational step
  (above), and until it is done the report must not claim independent regulatory signatures.
