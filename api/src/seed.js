// Seeds the platform accounts and imports the pre-existing UNZA issuer (already authorised
// on-chain) into the DB. Now also seeds the national governance seats — ZAQA, HEA — and the
// ECZ secondary-certification authority (which is itself a secondary-sector issuer), plus a
// one-time backfill of governance fields on any legacy issuers.
// Idempotent: safe to run repeatedly. Usage: node src/seed.js
import fs from "node:fs";
import path from "node:path";
import { connectDB, User, Issuer } from "./models/index.js";
import { config } from "./config/index.js";
import { hashPassword } from "./middleware/auth.js";
import { encryptKey } from "./services/keystore.service.js";
import { publicKeyFor } from "./services/signedQr.service.js";
import { registerInstitution } from "./services/issuerRegistration.service.js";
import mongoose from "mongoose";

async function seedUser(email, name, role, password) {
  const lower = email.toLowerCase();
  if (await User.findOne({ email: lower })) {
    console.log(`${role} exists:`, lower);
    return;
  }
  await User.create({ email: lower, name, role, passwordHash: await hashPassword(password) });
  console.log(`seeded ${role}:`, lower);
}

async function main() {
  await connectDB();

  // 1. platform super-user + national governance seats (regulators — NOT issuers)
  await seedUser(config.admin.email, "BBACVS Platform Administrator", "admin", config.admin.password);
  await seedUser(config.gov.zaqa.email, "ZAQA — National Qualifications Authority", "zaqa", config.gov.zaqa.password);
  await seedUser(config.gov.hea.email, "HEA — Higher Education Authority", "hea", config.gov.hea.password);
  await seedUser(config.gov.teveta.email, "TEVETA — Technical Education, Vocational and Entrepreneurship Training Authority", "teveta", config.gov.teveta.password);

  // 2. ECZ — secondary-school certification authority. Unlike ZAQA/HEA it *issues* certificates,
  //    so it needs an on-chain issuer identity + a linked officer login (role 'ecz').
  const eczEmail = config.gov.ecz.email.toLowerCase();
  if (!(await User.findOne({ email: eczEmail }))) {
    try {
      await registerInstitution({
        institution: "Examinations Council of Zambia (ECZ)",
        officerEmail: eczEmail,
        officerPassword: config.gov.ecz.password,
        officerName: "ECZ Certification Authority",
        sector: "secondary",
        heaStatus: "approved", // not HEA-regulated; kept approved so the issue gate passes
        zaqaTrusted: true,
        officerRole: "ecz",
      });
      console.log("seeded ECZ authority + issuer:", eczEmail);
    } catch (e) {
      // persist-first: the issuer/officer may already be stored with onChain:false — authorise later.
      console.warn("ECZ on-chain authorisation deferred:", e.message);
    }
  } else console.log("ecz exists:", eczEmail);

  // 3. import the existing UNZA issuer (from contracts/issuer-key.json) if present
  const issuerFile = path.resolve(process.cwd(), "../contracts/issuer-key.json");
  if (fs.existsSync(issuerFile) && config.issuer.privateKey) {
    const info = JSON.parse(fs.readFileSync(issuerFile, "utf8"));
    if (!(await Issuer.findOne({ walletAddress: info.address }))) {
      const issuer = await Issuer.create({
        institution: info.institution || "UNZA",
        did: `did:ethr:${info.address}`,
        walletAddress: info.address,
        encPrivateKey: encryptKey(config.issuer.privateKey),
        publicKey: publicKeyFor(config.issuer.privateKey),
        onChain: true,
        sector: "higher_ed",
        heaStatus: "approved",
        zaqaTrusted: true,
      });
      const officerEmail = "issuer@unza.zm";
      if (!(await User.findOne({ email: officerEmail }))) {
        await User.create({
          email: officerEmail, name: "UNZA Registrar", role: "issuer",
          passwordHash: await hashPassword("issuer12345"), issuer: issuer._id,
        });
      }
      console.log("seeded issuer:", info.institution, info.address, "(officer:", officerEmail, ")");
    } else console.log("UNZA issuer already imported");
  }

  // 4. one-time backfill: give legacy issuers (created before the governance fields existed)
  //    sane defaults so the HEA issue-gate and the ZAQA/HEA registries render correctly.
  const bf1 = await Issuer.updateMany({ sector: { $exists: false } }, { $set: { sector: "higher_ed" } });
  const bf2 = await Issuer.updateMany({ heaStatus: { $exists: false } }, { $set: { heaStatus: "approved" } });
  if (bf1.modifiedCount || bf2.modifiedCount) {
    console.log(`backfilled governance fields on ${Math.max(bf1.modifiedCount, bf2.modifiedCount)} legacy issuer(s)`);
  }

  await mongoose.disconnect();
  console.log("seed complete.");
}

main().catch((e) => { console.error(e); process.exit(1); });
