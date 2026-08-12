# Build Plan — Proposal Sprints → As-Built Status

Maps the five Agile/Scrum sprints (proposal §3.13) to what is **actually built and running**.
Updated to reflect the live deployment.

## Sprint 1 — Smart contracts ✅ done
- [x] `GovernanceSafe`, `IssuerRegistry`, `CredentialRegistry`, `RevocationRegistry`
- [x] OpenZeppelin AccessControl / ReentrancyGuard / Pausable
- [x] Hardhat config + deploy script + end-to-end test (5 passing)
- [x] **Deployed to Sepolia** (addresses in `deployments.sepolia.json`)
- [ ] Slither/Mythril static-analysis pass (deferred)

## Sprint 2 — DID/VC, IPFS, AES, REST API ✅ done
- [x] Express app, JWT/RBAC, Helmet, rate-limit, Joi validation, `trust proxy`
- [x] `crypto.service` (SHA-256, AES-256-GCM)
- [x] `signedQr.service` (ECDSA sign/verify, QR render, offline verify)
- [x] `ipfs.service` Pinata wiring — **pinning + retrieval verified**
- [x] MongoDB models + connection (users, issuers, credential index, logs)
- [x] `vc.service`: build + ECDSA-sign W3C VC (lightweight secp256k1 proof; Veramo-ready)
- [x] Real auth: bcrypt + JWT with roles (SIWE swap-in later)
- [x] On-chain issuer registration via GovernanceSafe 2-of-3 (`admin.routes` + `web3.service`)

## Sprint 3 — Issuer + Student portals ✅ done
- [x] `credentials/issue` full orchestration end-to-end (build→sign→encrypt→pin→anchor→QR)
- [x] Issuer portal: issue, list issued, revoke
- [x] Student portal: list own credentials, show QR, download PDF
- [x] PDF certificate generation (PDFKit) + embedded QR
- [ ] MetaMask client-side signing (currently server-side; production upgrade)

## Sprint 4 — Signed QR + verification portal ✅ mostly done
- [x] Online verify route (on-chain read) + polished verify portal UI (auto-verify via `?hash=`)
- [x] Offline verify route (cached-key ECDSA validation)
- [x] Verification result states + credential metadata display
- [x] **jsQR scanner (camera + image upload)** in the verify portal
- [x] **Client-side offline verification** — ECDSA validated in-browser against cached issuer keys (`lib/offline.js`), no network at verify time
- [x] Full credential hash embedded in the QR so a scan also drives on-chain verification
- [ ] Enforced TAMPERED detection: IPFS fetch + AES decrypt + SHA-256 recompute + compare
- [ ] IndexedDB issuer-key cache (localStorage cache works today; weekly auto-refresh pending)

## Sprint 5 — Integration, security, evaluation ◻ partial
- [x] Full multi-role E2E verified manually (register→issue→verify→revoke)
- [x] Deployed behind nginx + TLS; systemd services; MongoDB
- [ ] Mythril / OWASP ZAP / JMeter / Playwright automated suites
- [ ] The Graph subgraph for event indexing (audit route reads events directly today)
- [ ] SUS usability study (n=30)

## Deferred / production-only
- Real Gnosis Safe (replace the `GovernanceSafe` prototype)
- Self-hosted IPFS cluster (ZQA/ECZ/HEA); paid pinning
- Polygon PoS / zkEVM migration (no Solidity changes needed)
- ECZ/ZQA legacy system integration
- Client-side (MetaMask) issuance signing; HSM/KMS for issuer keys
