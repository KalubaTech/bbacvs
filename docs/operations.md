# Operations Runbook

Day-to-day operation of the live BBACVS deployment.

## Seeded accounts

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Admin (governance) | `admin@zut.ac.zm` | `admin12345` | registers issuers |
| Issuer (UNZA) | `issuer@unza.zm` | `issuer12345` | pre-seeded institution |

> **Change these before any real use.** They are demo credentials. Additional issuer accounts
> are created automatically when the admin registers an institution; graduates self-register.

## On-chain accounts (Sepolia testnet — worthless ETH)

| Account | Address | Purpose |
|---------|---------|---------|
| ZQA / deployer / funder | `0xB861022F68a204b6847959187e75fC8ee668B631` | deploys, governance signer 1, funds new issuers |
| ECZ | `0x68e44d5949E28ddBE2EdC4bcBfb96Ab929e3cC85` | governance signer 2 |
| HEA | `0x9f0E091CC5E0802d210e1EEb1F5D3da0cf628e09` | governance signer 3 (not actively used) |
| UNZA issuer | `0xB917d254666bFC3b72cE44b5343a9cc57197Ba91` | seeded institution signing key |

Key files (mode 600, gitignored): `contracts/governance-keys.json`, `contracts/issuer-key.json`.
Dynamically-registered issuer keys are stored **AES-encrypted** in MongoDB (`issuers.encPrivateKey`).

## Funding (running low on gas)

Costs (approx, Sepolia): issuer registration ~0.01 ETH, credential anchor ~0.002 ETH,
revocation ~0.002 ETH.

To top up: mine ETH to the funder at **https://sepolia-faucet.pk910.de** (no daily cap) or the
Google/Alchemy faucets, sending to `0xB861…B631`. Then redistribute:

```bash
cd /var/www/bbacvs/contracts
node scripts/refuel-funder.js   # sweeps surplus from ECZ/UNZA back to the funder
# or send manually to the issuer/signer accounts as needed
```

Check balances:
```bash
cd /var/www/bbacvs/contracts && node -e '
require("dotenv").config();const {ethers}=require("ethers");const fs=require("fs");
const p=new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const g=JSON.parse(fs.readFileSync("governance-keys.json")).wallets.reduce((a,w)=>(a[w.role]=w,a),{});
const i=JSON.parse(fs.readFileSync("issuer-key.json"));
(async()=>{for(const[n,a]of[["ZQA",g.ZQA.address],["ECZ",g.ECZ.address],["UNZA",i.address]])
console.log(n,ethers.formatEther(await p.getBalance(a)),"ETH");})();'
```

## Common commands

```bash
# status / logs
systemctl status bbacvs bbacvs-api mongod
journalctl -u bbacvs-api -f          # or: tail -f /tmp/bbacvs-api.log
tail -f /tmp/bbacvs.log

# restart
systemctl restart bbacvs-api         # API (after code/.env changes)
systemctl restart bbacvs             # web (after a rebuild)

# rebuild the web app after changing web/ code
cd /var/www/bbacvs/web
node /var/www/bbacvs/node_modules/next/dist/bin/next build && systemctl restart bbacvs

# re-seed (idempotent)
cd /var/www/bbacvs/api && node src/seed.js

# nginx
nginx -t && systemctl reload nginx
```

## Maintenance scripts (`contracts/scripts/` and `api/src/`)

| Script | Purpose |
|--------|---------|
| `contracts/scripts/deploy.js` | deploy the 4 contracts to Sepolia |
| `contracts/scripts/gen-keys.js` | generate a fresh governance keyset |
| `contracts/scripts/refuel-funder.js` | sweep ETH from ECZ/UNZA back to the funder |
| `contracts/scripts/demo-issue.js` | CLI end-to-end demo (register issuer + issue) |
| `api/src/seed.js` | seed admin + UNZA issuer |
| `api/src/cleanup-pending-issuers.js` | remove issuers that failed on-chain registration, reclaim their ETH |

## MongoDB

```bash
mongosh bbacvs                                  # open shell
# quick counts
mongosh --quiet bbacvs --eval 'printjson({
  users: db.users.countDocuments(),
  issuers: db.issuers.countDocuments(),
  credentials: db.credentialindices.countDocuments() })'
# backup / restore
mongodump --db bbacvs --out /var/backups/bbacvs-$(date +%F)
mongorestore --db bbacvs /var/backups/bbacvs-YYYY-MM-DD/bbacvs
```

Because MongoDB is a non-authoritative index, it can also be rebuilt from on-chain
`CredentialIssued` events (`GET /api/audit`) + IPFS if ever lost.

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `insufficient funds` on issue/register | Funder or issuer out of Sepolia ETH → top up (see Funding). |
| Issue hangs then times out | Fee below network base fee. Fees are network-priced now; check `web3.service` `withGas`. |
| `estimateGas missing revert data` | Duplicate credential hash, or unauthorised issuer. Check `/api/verify/:hash`. |
| `X-Forwarded-For … trust proxy` warning | Ensure `app.set("trust proxy", 1)` is present (it is). |
| 502 from nginx | The Node service is down → `systemctl status bbacvs-api`, check `/tmp/bbacvs-api.log`. |
| Verify returns `NOT_FOUND` for a real cred | The anchor tx may not be mined yet; retry in ~15s. |
| API won't start (`Missing required env var`) | `JWT_SECRET` missing in `api/.env` under `NODE_ENV=production`. |

## Security hygiene checklist

- [ ] Change the seeded admin/issuer passwords.
- [ ] Rotate `PINATA_JWT` if it was shared in plaintext.
- [ ] Keep `.env`, `governance-keys.json`, `issuer-key.json` at mode 600, never committed.
- [ ] These are **testnet** keys — never place mainnet keys or real funds here.
