import dotenv from "dotenv";
dotenv.config();

const required = (key) => {
  const v = process.env[key];
  if (!v && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
};

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  env: process.env.NODE_ENV || "development",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",

  jwt: {
    secret: required("JWT_SECRET") || "dev_secret",
    accessTtl: process.env.JWT_ACCESS_TTL || "15m",
    refreshTtl: process.env.JWT_REFRESH_TTL || "7d",
  },

  mongoUri: process.env.MONGODB_URI || "",

  chain: {
    rpcUrl: process.env.SEPOLIA_RPC_URL || "",
    credentialRegistry: process.env.CREDENTIAL_REGISTRY_ADDRESS || "",
    issuerRegistry: process.env.ISSUER_REGISTRY_ADDRESS || "",
    revocationRegistry: process.env.REVOCATION_REGISTRY_ADDRESS || "",
    governanceSafe: process.env.GOVERNANCE_SAFE_ADDRESS || "",
  },

  ipfs: {
    pinataJwt: process.env.PINATA_JWT || "",
    gateway: process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud",
  },

  aesKey: process.env.AES_256_KEY || "",

  // Server-side issuer used to seed the pre-existing UNZA issuer into the DB.
  issuer: {
    privateKey: process.env.ISSUER_PRIVATE_KEY || "",
    institution: process.env.ISSUER_INSTITUTION || "",
  },

  // Governance (2-of-3) signer keys the API uses to register issuers on-chain,
  // plus a funder that tops up new issuer wallets with gas. Testnet keys.
  governance: {
    signer1: process.env.GOV_SIGNER1_PRIVATE_KEY || "",
    signer2: process.env.GOV_SIGNER2_PRIVATE_KEY || "",
    funder: process.env.GOV_FUNDER_PRIVATE_KEY || "",
  },

  // ZAQA authority key used to sign the QR on the national verification certificate.
  // Falls back to governance signer1 if a dedicated key isn't configured.
  zaqa: {
    signingKey: process.env.ZAQA_SIGNING_KEY || process.env.GOV_SIGNER1_PRIVATE_KEY || "",
  },

  admin: {
    email: process.env.ADMIN_EMAIL || "admin@zut.ac.zm",
    password: process.env.ADMIN_PASSWORD || "admin12345",
  },

  // National governance seats seeded by src/seed.js (change passwords after first login).
  gov: {
    zaqa: {
      email: process.env.ZAQA_EMAIL || "registry@zaqa.gov.zm",
      password: process.env.ZAQA_PASSWORD || "zaqa12345",
    },
    hea: {
      email: process.env.HEA_EMAIL || "compliance@hea.gov.zm",
      password: process.env.HEA_PASSWORD || "hea12345",
    },
    teveta: {
      email: process.env.TEVETA_EMAIL || "compliance@teveta.org.zm",
      password: process.env.TEVETA_PASSWORD || "teveta12345",
    },
    ecz: {
      email: process.env.ECZ_EMAIL || "certification@ecz.gov.zm",
      password: process.env.ECZ_PASSWORD || "ecz12345",
    },
  },
};
