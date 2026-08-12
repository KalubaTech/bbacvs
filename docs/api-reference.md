# API Reference

Base URL: `https://bbacvs.kalootech.com/api` (proxied to the Express service on `127.0.0.1:4000`).
All request/response bodies are JSON. Protected routes require `Authorization: Bearer <JWT>`.

Roles: `admin` (governance), `issuer` (institution), `holder` (graduate). Verify routes are public.

## Auth

### `POST /auth/register` — public
Self-registration for graduates (holders).
```json
{ "email": "grad@mu.zm", "password": "min8chars", "name": "Nelson Chituli",
  "holderDID": "did:ethr:0x…40hex" }
→ 201 { "accessToken": "…", "user": { "role": "holder", … } }
```

### `POST /auth/login` — public
```json
{ "email": "admin@zut.ac.zm", "password": "…" }
→ 200 { "accessToken": "…", "user": { "role": "admin", "email": … } }
```

### `GET /auth/me` — any authenticated
Returns the decoded token user.

## Admin (governance)

### `POST /admin/issuers` — `admin`
Registers an institution as an on-chain issuer (2-of-3 GovernanceSafe). Generates the
institution's signing wallet, funds it, authorises it on-chain, and creates the officer login.
Takes ~30–60s.
```json
{ "institution": "Mulungushi University", "officerName": "MU Registrar",
  "officerEmail": "registrar@mu.zm", "officerPassword": "min8chars" }
→ 201 { "issuer": { "institution", "did", "walletAddress", "onChain", "registrationTx" },
        "officer": { "email", "name" } }
```

### `GET /admin/issuers` — `admin`
Lists the issuer registry.

## Credentials

### `POST /credentials/issue` — `issuer`
Builds + signs a W3C VC, encrypts, pins to IPFS, anchors on-chain, returns a signed QR.
```json
{ "holderDID": "did:ethr:0x…", "holderEmail": "grad@mu.zm" (optional),
  "claims": { "name": "…", "qualification": "…", "graduationYear": 2026 } }
→ 201 { "credentialHash", "cid", "issuerDID", "institution", "issuerPublicKey",
        "anchor": { "txHash", "blockNumber" }, "qrPayload": {…}, "qrImage": "data:image/png;base64,…" }
```

### `GET /credentials/mine` — `issuer`
Credentials issued by the caller's institution.

### `GET /credentials/holder` — `holder`
Credentials issued to the caller (matched by DID or email).

### `POST /credentials/revoke` — `issuer`
```json
{ "credentialHash": "0x…64hex", "reasonCode": 2 }   // 1 admin err · 2 fraud · 3 regulatory · 4 holder · 5 other
→ 200 { "status": "revoked", "reasonCode": 2, "tx": { "txHash" } }
```

### `GET /credentials/:hash/qr` — authenticated
Returns `{ qrPayload, qrImage }`.

### `GET /credentials/:hash/pdf` — authenticated
Returns a PDF certificate (`Content-Type: application/pdf`).

## Verify (public)

### `GET /verify/:hash`
Online verification against the chain, enriched with index metadata.
```json
→ { "status": "VERIFIED" | "REVOKED" | "UNKNOWN_ISSUER" | "NOT_FOUND",
    "issuer": "0x…", "issuedAt": 1782890594, "mode": "online",
    "credential": { "institution", "subjectName", "qualification", "graduationYear", "holderDID" } }
```

### `POST /verify/offline`
Validates a signed QR's ECDSA signature against a supplied (cached) issuer public key.
```json
{ "payload": { "cred_did","cid","hash8","iss_pk_ref","iat","sig" }, "issuerPubKey": "02…" }
→ { "status": "OFFLINE_VERIFIED" | "INVALID", "issuer": "did:ethr:0x…" }
```

## Health

### `GET /health` → `{ "ok": true, "service": "bbacvs-api" }`

## Errors

Standard shape: `{ "error": "message" }` with appropriate HTTP status (400 validation,
401 unauth, 403 role, 404 not found, 409 conflict, 5xx server). Rate limit: 100 req/min/IP.
