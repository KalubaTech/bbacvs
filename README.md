# BBACVS — Blockchain-Based Academic Credential Verification System

A hybrid decentralised system for issuing and verifying academic credentials, built for
the Zambian higher-education context. Credential validity is anchored on **Ethereum**, the
encrypted credential payload lives on **IPFS**, credentials follow **W3C DID/VC** standards,
and verification happens via **ECDSA-signed QR codes** that work both online and offline.

> Bachelor of ICT research prototype — Zambia University College of Technology (ZUT), 2026.
> Scoped to the **Ethereum Sepolia testnet**. Not for mainnet/production use as-is.

## Architecture (three-tier, hybrid-decentralised)

```
Tier 1 — Presentation   web/        Next.js 14 · React 18 · Tailwind · 3 portals
Tier 2 — Application     api/        Node/Express · JWT · Veramo · crypto · IPFS · Web3
Tier 3 — Hybrid Data     contracts/  Ethereum (source of truth) · IPFS (store) · Mongo (index)
```

Trust hierarchy: **Ethereum = authoritative**, IPFS = decentralised encrypted store,
MongoDB = non-authoritative auxiliary index (fully reconstructable from on-chain events).

## Packages

| Path         | Description                                                              | Stack |
|--------------|--------------------------------------------------------------------------|-------|
| `contracts/` | Solidity smart contracts + Hardhat tests                                 | Solidity 0.8.x, Hardhat, OpenZeppelin |
| `api/`       | REST API: VC build, ECDSA sign, AES-256-GCM encrypt, IPFS pin, anchoring | Node 18, Express, Veramo, ethers, Pinata, MongoDB |
| `web/`       | Issuer / Student / Verification portals                                  | Next.js 14, React 18, Tailwind |
| `docs/`      | Architecture notes mapping the proposal to code                          | — |

## Quick start

```bash
# 1. Contracts — compile, test, deploy to Sepolia
cd contracts && npm install
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.js --network sepolia

# 2. API
cd ../api && npm install
cp .env.example .env   # fill in keys
npm run dev

# 3. Web
cd ../web && npm install
cp .env.example .env.local
npm run dev
```

## Smart contracts

| Contract             | Responsibility                                                        |
|----------------------|----------------------------------------------------------------------|
| `GovernanceSafe`     | 2-of-3 multi-sig (ZQA / ECZ / HEA) gating privileged operations       |
| `IssuerRegistry`     | Role-gated registry of authorised institutional issuers (`ISSUER_ROLE`) |
| `CredentialRegistry` | Anchors `(hash, cidHash, issuerDID)`; read-only verification          |
| `RevocationRegistry` | Timestamped revocation with standardised reason codes (0–5)           |

## Security model (ten-layer defence-in-depth)

SHA-256 hashing · ECDSA (secp256k1) signatures · OpenZeppelin AccessControl ·
2-of-3 multi-sig governance · AES-256-GCM encryption · signed QR payloads ·
JWT-secured API · TLS 1.3 · on-chain audit events · ReentrancyGuard.

Aligned with **OWASP ASVS 4.0** and **SCSVS Level 2**.

## Status — live

Deployed and working end-to-end at **https://bbacvs.kalootech.com** (Ethereum Sepolia testnet).
Full multi-role system: governance registers issuers on-chain, institutions issue credentials,
graduates hold/download them, employers verify online & offline.

**Demo logins** (change before real use):
- Admin: `admin@zut.ac.zm` / `admin12345`
- Issuer (UNZA): `issuer@unza.zm` / `issuer12345`
- Graduate: self-register at `/register`

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) | **Start here** — overview, stack, how each layer was built, flows |
| [docs/architecture.md](docs/architecture.md) | Trust hierarchy, contracts, data model, signed-QR design |
| [docs/deployment.md](docs/deployment.md) | Infrastructure: nginx, systemd, MongoDB, contract deploy, env |
| [docs/api-reference.md](docs/api-reference.md) | All REST endpoints |
| [docs/operations.md](docs/operations.md) | Runbook: accounts, keys, funding, commands, troubleshooting |
| [docs/fraud-and-qr-security.md](docs/fraud-and-qr-security.md) | How blockchain prevents fraud + QR-code threat analysis |
| [docs/build-plan.md](docs/build-plan.md) | Sprint-by-sprint as-built status |
