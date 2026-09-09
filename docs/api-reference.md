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
{ "holderEmail": "grad@mu.zm",
  "claims": { "name": "…", "nationalId": "123456/78/1" (optional NRC/passport),
              "qualification": "…", "graduationYear": 2026 } }
→ 201 { "credentialHash", "cid", "institution",
        "anchor": { "txHash", "blockNumber" }, "qrPayload": {…}, "qrImage": "data:image/png;base64,…" }
```

**Duplicate-issuance guard** (also applies to `POST /credentials/prepare`,
`POST /credentials/:hash/supersede` and `POST /applications/:id/verify-issue`). Before any
off-chain or on-chain work, the API refuses to issue when a live credential — status
`active`, `pending` (awaiting MetaMask anchor) or `suspended` — already exists for the same
**institution + candidate + qualification (case-insensitive) + graduation year**. The
candidate is matched by **email OR national ID (NRC)**, so a changed email address does not
evade the check. A second identical request that arrives while the first is still pinning /
anchoring (a double-clicked button) is refused by an in-flight lock.
```json
→ 409 { "error": "An active or pending credential already exists for this candidate and programme.",
        "code": "duplicate_credential",
        "existing": { "credentialHash", "status", "issuedAt", "matchedOn": ["email" | "nationalId"] } }
→ 409 { "error": "This credential is already being issued — please wait for the first request to finish.",
        "code": "issuance_in_progress" }
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
Online verification against the chain, enriched with index metadata. `:hash` must be a
`0x`-prefixed 32-byte hex string — anything else is rejected with `400 { "error": "Invalid credential hash" }`.
```json
→ { "status": "VERIFIED" | "REVOKED" | "UNKNOWN_ISSUER" | "NOT_FOUND",
    "displayStatus": "VERIFIED" | "PENDING_ZAQA_VALIDATION" | "SUSPENDED" | …,
    "issuer": "0x…", "issuedAt": 1782890594, "mode": "online",
    "credential": { "institution", "subjectName", "nationalId": "••••••/78/1", "qualification",
                    "graduationYear", "holderDID", "zqfLevel", "credentialType", "zaqaValidation" },
    "governance": {…}, "summary": {…} }
```
`credential.nationalId` is the holder's NRC / passport **masked** (`123456/78/1 → ••••••/78/1`;
other formats keep only the last two characters; `null` when none is on record). It lets an
employer tell two graduates with the same name apart — the full identifier is never exposed
on any public surface.

### `POST /verify/offline`
Validates a signed QR's ECDSA signature against a supplied (cached) issuer public key.
```json
{ "payload": { "cred_did","cid","hash8","iss_pk_ref","iat","sig" }, "issuerPubKey": "02…" }
→ { "status": "OFFLINE_VERIFIED" | "INVALID", "issuer": "did:ethr:0x…" }
```

## Applications (credential digitization)

### `POST /applications` — `holder`
One **open** application per (institution, qualification, graduation year). An application is
open while its status is `submitted`, `screening`, `under_review`, `awaiting_evidence` or
`decision_pending`; a new one is only accepted once the previous has reached a final state
(`issued`, `rejected`, `withdrawn`). The applicant is matched by email or by NRC.
```json
→ 409 { "error": "You already have an open application for this credential (currently under review). …",
        "code": "duplicate_application", "applicationId", "status" }
```

## Health

### `GET /health` → `{ "ok": true, "service": "bbacvs-api" }`

## Errors

Standard shape: `{ "error": "message" }` with appropriate HTTP status (400 validation,
401 unauth, 403 role, 404 not found, 409 conflict, 5xx server). Rate limit: 100 req/min/IP.
