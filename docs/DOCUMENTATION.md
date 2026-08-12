# BBACVS — Full Project Documentation

**Blockchain-Based Academic Credential Verification System**
Zambia University College of Technology (ZUT) · BICTE · 2026

This document explains, end to end, how the BBACVS was designed, built, deployed, and how
to operate it. It reflects the **as-built** system, not just the proposal.

## Contents

1. [Overview](#1-overview)
2. [Architecture](architecture.md)
3. [Technology stack](#3-technology-stack)
4. [How each layer was built](#4-how-each-layer-was-built)
5. [End-to-end flows](#5-end-to-end-flows)
6. [Deployment & infrastructure](deployment.md)
7. [API reference](api-reference.md)
8. [Operations runbook](operations.md)
9. [Security model](#9-security-model) · [Fraud & QR threat analysis](fraud-and-qr-security.md)
10. [Known limitations & prototype simplifications](#10-known-limitations--prototype-simplifications)

---

## 1. Overview

BBACVS lets Zambian higher-education institutions issue **tamper-proof academic credentials**
and lets anyone verify them instantly — online or offline — without contacting the issuing
institution.

It is a **hybrid decentralised** system with an explicit trust hierarchy:

| Layer | Role | Authority |
|-------|------|-----------|
| **Ethereum (Sepolia)** | Anchors credential hash, issuer registry, revocations | **Authoritative source of truth** |
| **IPFS (Pinata)** | Stores AES-256-GCM encrypted W3C VC documents | Decentralised content-addressed store |
| **MongoDB** | Users, issuers, credential index, logs | Non-authoritative cache (rebuildable from chain) |

Live at **https://bbacvs.kalootech.com**.

### The four actors

- **Governance (Admin)** — ZQA/ECZ/HEA. Registers institutions as issuers via a 2-of-3 multi-sig.
- **Issuer (Institution)** — issues signed credentials.
- **Holder (Graduate)** — owns credentials, presents QR/PDF (Self-Sovereign Identity).
- **Verifier (Employer)** — validates credentials; no account needed.

---

## 3. Technology stack

| Concern | Choice |
|---------|--------|
| Smart contracts | Solidity 0.8.24, Hardhat, OpenZeppelin 5 |
| Blockchain | Ethereum Sepolia testnet (via Infura) |
| Off-chain storage | IPFS via Pinata (`pinata-web3` SDK) |
| Backend API | Node 20, Express, ES modules |
| Identity/crypto | `@noble/curves` (secp256k1 ECDSA), Node `crypto` (SHA-256, AES-256-GCM) |
| Credentials | W3C Verifiable Credentials (JSON-LD), did:ethr |
| Database | MongoDB 8.0 (Mongoose) |
| Auth | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| PDF / QR | `pdfkit`, `qrcode` |
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS |
| Reverse proxy / TLS | nginx + Let's Encrypt (Certbot) |
| Process mgmt | systemd |

Repository layout:

```
/var/www/bbacvs
├── contracts/   Solidity + Hardhat (on-chain layer)
├── api/         Express REST API (application layer)
├── web/         Next.js portals (presentation layer)
└── docs/        this documentation
```

---

## 4. How each layer was built

### 4.1 Smart contracts (`contracts/`)

Four contracts, deployed to Sepolia in this order (see `scripts/deploy.js`):

1. **GovernanceSafe** — minimal 2-of-3 multi-sig (ZQA, ECZ, HEA). `proposeTransaction` /
   `confirmTransaction`; executes automatically once 2 confirmations are reached. Holds the
   admin role over the registries so no single regulator acts unilaterally.
2. **IssuerRegistry** — OpenZeppelin `AccessControl`. `grantIssuerRole(account, did, institution)`
   is gated to the GovernanceSafe. Exposes `isAuthorised()` and `issuerDID()`.
3. **RevocationRegistry** — timestamped, reason-coded revocations (0–5). Only the authorised
   issuer can revoke.
4. **CredentialRegistry** — anchors `(credentialHash, cidHash, issuerDID)`. `verifyCredential()`
   is a read-only, zero-gas view returning one of `NOT_FOUND / VERIFIED / REVOKED / UNKNOWN_ISSUER`.
   Uses `ReentrancyGuard` + `Pausable`.

Tested with Hardhat (`test/bbacvs.test.js`, 5 passing) covering governance, authorisation,
issuance, verification, and revocation. Deployed addresses are recorded in
`contracts/deployments.sepolia.json`.

### 4.2 Application / API (`api/`)

Express app (`src/app.js`) with a security middleware stack (Helmet, CORS, rate limiting,
Joi validation, `trust proxy` for nginx) and these route groups:

- `auth` — register (holder), login, me. bcrypt passwords, JWT with role + ids.
- `admin` — register issuers on-chain, list registry (governance only).
- `credentials` — issue, list-mine, holder-list, revoke, QR, PDF.
- `verify` — online (chain) + offline (ECDSA) — public.

Services (`src/services/`):

- `crypto` — SHA-256 canonical hash, AES-256-GCM encrypt/decrypt.
- `vc` — build + ECDSA-sign W3C VCs.
- `signedQr` — 6-field ECDSA-signed QR payload, offline verify, QR render.
- `ipfs` — pin encrypted payload to Pinata, fetch by CID.
- `web3` — verify on-chain; register issuers via 2-of-3; anchor/revoke per-issuer.
- `keystore` — encrypt issuer signing keys at rest.
- `pdf` — certificate PDF with embedded QR.

Data lives in MongoDB (`src/models/index.js`): `users`, `issuers`, `credentialindices`,
`verificationlogs`. Seeded via `src/seed.js` (admin + the initial UNZA issuer).

### 4.3 Presentation / Web (`web/`)

Next.js 14 App Router. Role-aware navigation, localStorage JWT, and these pages:

`/` landing · `/login` · `/register` · `/admin` (governance) · `/issuer` · `/student` · `/verify`.

Shared UI primitives in `components/ui.js`; design tokens in `tailwind.config.js` +
`app/globals.css`. The API base is `NEXT_PUBLIC_API_URL` (same origin, `/api` proxied by nginx).

---

## 5. End-to-end flows

### Issuer registration (dynamic)
Admin submits an institution → API generates a signing wallet → funds it → proposes
`grantIssuerRole` on the GovernanceSafe (signer 1) → confirms (signer 2) → contract executes →
issuer stored (key encrypted) + officer login created.

### Credential issuance
Issuer submits graduate data → API builds a W3C VC → ECDSA-signs it → SHA-256 hashes it →
AES-256-GCM encrypts → pins to IPFS (CID) → anchors `(hash, keccak(CID))` on-chain as that
issuer → builds a signed QR → indexes metadata in MongoDB.

### Verification
- **Online**: `GET /api/verify/:hash` reads `CredentialRegistry.verifyCredential` (zero gas)
  and enriches with index metadata → `VERIFIED / REVOKED / UNKNOWN_ISSUER / NOT_FOUND`.
- **Offline**: `POST /api/verify/offline` validates the QR's ECDSA signature against a cached
  issuer public key — no network/chain needed.

### Revocation
Issuer calls `RevocationRegistry.revoke(hash, reasonCode)`; subsequent verification returns
`REVOKED`.

---

## 9. Security model

Ten-layer defence-in-depth (aligned to OWASP ASVS 4.0 / SCSVS L2):

1. **SHA-256** canonical credential hashing
2. **ECDSA (secp256k1)** signatures on every VC and QR
3. **OpenZeppelin AccessControl** role-gating (`ISSUER_ROLE`)
4. **2-of-3 multi-sig** governance (no unilateral control)
5. **AES-256-GCM** encryption of VC payloads before IPFS
6. **Signed QR payloads** (clone-resistant, offline-verifiable)
7. **JWT** short-lived tokens + bcrypt passwords + rate limiting + Joi validation
8. **TLS 1.3** (Let's Encrypt) on all endpoints
9. **On-chain audit events** (CredentialIssued/Revoked/IssuerGranted)
10. **ReentrancyGuard** + packed structs on the contracts

Additional: issuer signing keys are AES-encrypted at rest; the API binds to loopback only
(reachable solely via nginx); no plaintext PII on-chain.

---

## 10. Known limitations & prototype simplifications

- **Server-side signing.** The API holds issuer keys and anchors on their behalf for a smooth
  demo. Production should sign in the browser via MetaMask (client-side keys).
- **VC proof.** Uses a lightweight `EcdsaSecp256k1Signature2019`-style proof rather than a full
  Veramo JWT VC. The service shapes are Veramo-ready — a drop-in swap.
- **Testnet only.** All performance/cost figures are scoped to Sepolia. Gas is real testnet ETH.
- **Tamper detection.** Online verify currently trusts the on-chain hash; re-fetching the IPFS
  payload to recompute SHA-256 for an explicit `TAMPERED` state is wired but not enforced.
- **Single IPFS gateway / free Pinata tier.** Production needs a dedicated pinning cluster.

See [operations.md](operations.md) for accounts, keys, funding, and day-to-day commands.
