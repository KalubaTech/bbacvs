# BBACVS Architecture

Three-tier hybrid-decentralised architecture. The defining principle is an **explicit trust
hierarchy**: the blockchain is the sole authoritative source of truth; IPFS is the
decentralised encrypted store; MongoDB is a non-authoritative auxiliary index that can be
rebuilt entirely from on-chain events.

> **As-built notes (current deployment).** This diagram shows the proposal's target design.
> The live prototype differs in three pragmatic ways: (1) **MongoDB runs locally** on the host
> (not Atlas); (2) **issuance is server-side** — the API holds per-issuer keys and anchors on
> their behalf, rather than signing in the browser via MetaMask; (3) VC signing uses a
> **lightweight secp256k1 proof**, not a full Veramo JWT VC. See
> [DOCUMENTATION.md §10](DOCUMENTATION.md#10-known-limitations--prototype-simplifications).

```
┌─────────────────────────────────────────────────────────────────────┐
│ Tier 1 — Presentation (web/)                                          │
│   Issuer Portal · Student Portal · Verification Portal                 │
│   Next.js 14 · React 18 · Tailwind · MetaMask · jsQR                   │
└───────────────┬─────────────────────────────────────────────────────┘
                │ HTTPS / JWT
┌───────────────▼─────────────────────────────────────────────────────┐
│ Tier 2 — Application (api/)                                           │
│   REST API · JWT · rate-limit · Helmet · Joi                          │
│   Services: crypto (SHA-256, AES-256-GCM) · signedQR (ECDSA) ·        │
│             ipfs (Pinata) · vc (Veramo/DID) · web3 (ethers)           │
└───────────────┬───────────────────────┬─────────────────────────────┘
                │                        │
┌───────────────▼──────────┐  ┌──────────▼──────────┐  ┌────────────────┐
│ Ethereum Sepolia          │  │ IPFS (Pinata)        │  │ MongoDB Atlas  │
│ AUTHORITATIVE             │  │ DECENTRALISED STORE  │  │ NON-AUTHORIT.  │
│ GovernanceSafe            │  │ AES-256-GCM VC docs  │  │ aux index only │
│ IssuerRegistry            │  │ content-addressed    │  │ rebuildable    │
│ CredentialRegistry        │  │ (CID)                │  │ from events    │
│ RevocationRegistry        │  └──────────────────────┘  └────────────────┘
└───────────────────────────┘
```

## Issuance flow (Figure 3.3)

1. Issuer authenticates (JWT + MetaMask).
2. API builds a W3C VC (`vc.service`), SHA-256 hashes it (`crypto.sha256`).
3. ECDSA-signs the VC (Veramo), AES-256-GCM encrypts the payload (`crypto.aesEncrypt`).
4. Pins the ciphertext to IPFS → CID (`ipfs.pin`).
5. Anchors `(credentialHash, cidHash)` on-chain via `CredentialRegistry.issueCredential`
   (tx signed in MetaMask).
6. Builds the 6-field signed QR payload (`signedQr.buildSignedPayload`) and embeds it in a
   PDF certificate; delivers to the holder.

## Online verification (Figure 3.4)

Parse QR → validate ECDSA sig → IPFS fetch + AES decrypt → recompute SHA-256 →
`CredentialRegistry.verifyCredential` (read-only, zero gas) → compare hashes.
Result ∈ {VERIFIED, TAMPERED, REVOKED, UNKNOWN_ISSUER, NOT_FOUND}.

## Offline verification (Figure 3.5)

Validate the QR's embedded ECDSA signature against a **pre-cached issuer public key**
(`signedQr.verifyOffline`) — no network needed. Confirms issuer authenticity + QR
integrity; full revocation status requires a later online re-check.

## Ten-layer security model → code

| Layer | Control                       | Where |
|-------|-------------------------------|-------|
| L1    | SHA-256 hashing               | `api/.../crypto.service.js` |
| L2    | ECDSA (secp256k1) signatures  | `api/.../signedQr.service.js`, `vc.service.js` |
| L3    | OpenZeppelin AccessControl    | `contracts/.../IssuerRegistry.sol` |
| L4    | 2-of-3 multi-sig governance   | `contracts/.../GovernanceSafe.sol` |
| L5    | AES-256-GCM encryption        | `api/.../crypto.service.js` |
| L6    | Signed QR payload             | `api/.../signedQr.service.js` |
| L7    | API security (JWT/rate/Joi)   | `api/.../middleware/` |
| L8    | TLS 1.3 / HSTS                | deployment (Vercel/Let's Encrypt) + Helmet |
| L9    | On-chain audit events         | `contracts/*` events + `audit.routes.js` |
| L10   | ReentrancyGuard / gas         | `contracts/.../CredentialRegistry.sol` |
