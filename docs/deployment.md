# Deployment & Infrastructure

How BBACVS is deployed on the host (`bbacvs.kalootech.com`, IP `62.169.16.4`).

## Topology

```
Internet ──► nginx :443 (TLS, Let's Encrypt) ──┬── /            → 127.0.0.1:3010  bbacvs.service      (Next.js)
                                                └── /api,/health → 127.0.0.1:4000  bbacvs-api.service  (Express)
                                                                          │
                                          ┌───────────────────────────────┼───────────────────────┐
                                          ▼                               ▼                       ▼
                                   Ethereum Sepolia               IPFS (Pinata)          MongoDB :27017
                                   (via Infura RPC)               (pinata-web3)          (mongod.service)
```

Both Node services bind to **loopback only**; nginx is the sole public entry point.

## Services (systemd)

| Unit | Role | Port | Working dir |
|------|------|------|-------------|
| `bbacvs.service` | Next.js web | `127.0.0.1:3010` | `/var/www/bbacvs/web` |
| `bbacvs-api.service` | Express API | `127.0.0.1:4000` | `/var/www/bbacvs/api` |
| `mongod.service` | MongoDB 8.0 | `127.0.0.1:27017` | — |

Unit files: `/etc/systemd/system/bbacvs.service`, `/etc/systemd/system/bbacvs-api.service`.
Both are `enabled` (start on boot), `Restart=on-failure`, logging to `/tmp/bbacvs.log` and
`/tmp/bbacvs-api.log`.

## nginx

Vhost: `/etc/nginx/sites-available/bbacvs.kalootech.com` (symlinked into `sites-enabled`).

- Proxies `/api/` and `/health` to `127.0.0.1:4000`; everything else to `127.0.0.1:3010`.
- TLS added by Certbot (`certbot --nginx -d bbacvs.kalootech.com`), auto-renewing. HTTP→HTTPS 301.

After editing the vhost: `nginx -t && systemctl reload nginx`.

## MongoDB install (Ubuntu 24.04 "noble")

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
  | gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
  > /etc/apt/sources.list.d/mongodb-org-8.0.list
apt-get update && apt-get install -y mongodb-org
systemctl enable --now mongod
```

DB URI (loopback, no auth for a local prototype): `mongodb://127.0.0.1:27017/bbacvs`.

## Smart-contract deployment (Sepolia)

```bash
cd /var/www/bbacvs/contracts
cp .env.example .env            # set SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, GOV_OWNER_*
npx hardhat run scripts/deploy.js --network sepolia
```

Deployed addresses (also in `deployments.sepolia.json`):

| Contract | Address |
|----------|---------|
| GovernanceSafe | `0x39aea70a718B5a77710aE0a40B4d79fcE18Ef990` |
| IssuerRegistry | `0x99B41d97B29E85831591a2fb0f5ce5132BFb73ED` |
| RevocationRegistry | `0xB23E0922Bd655FbC4CE17d1236120e5685918263` |
| CredentialRegistry | `0x785c52048cf543fd7907986BB77170345059B8D2` |

These addresses are wired into `api/.env` (`*_REGISTRY_ADDRESS`, `GOVERNANCE_SAFE_ADDRESS`).

## First-time bring-up (from scratch)

```bash
# 1. install workspace deps (per package to avoid pulling all)
cd /var/www/bbacvs
npm install -w @bbacvs/contracts
npm install -w @bbacvs/api
npm install -w @bbacvs/web

# 2. contracts
cd contracts && npx hardhat test && npx hardhat run scripts/deploy.js --network sepolia

# 3. api
cd ../api && cp .env.example .env   # fill secrets + contract addresses
node src/seed.js                    # seed admin + UNZA issuer
systemctl restart bbacvs-api

# 4. web
cd ../web && cp .env.example .env.production   # NEXT_PUBLIC_API_URL=https://bbacvs.kalootech.com
node /var/www/bbacvs/node_modules/next/dist/bin/next build
systemctl restart bbacvs
```

## Environment variables

**`api/.env`** — `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `JWT_SECRET`, `MONGODB_URI`,
`SEPOLIA_RPC_URL`, `*_REGISTRY_ADDRESS`, `GOVERNANCE_SAFE_ADDRESS`, `PINATA_JWT`,
`PINATA_GATEWAY`, `AES_256_KEY`, `GOV_SIGNER1/2_PRIVATE_KEY`, `GOV_FUNDER_PRIVATE_KEY`,
`ISSUER_PRIVATE_KEY` (seed UNZA), `ADMIN_EMAIL/PASSWORD`.

**`contracts/.env`** — `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, `GOV_OWNER_ZQA/ECZ/HEA`.

**`web/.env.production`** — `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CHAIN_ID`.

Secret files are `chmod 600` and gitignored (`.env`, `governance-keys.json`, `issuer-key.json`).
