import { createApp } from "./app.js";
import { connectDB, CredentialIndex } from "./models/index.js";
import { config } from "./config/index.js";
import { warmIntegrityCache } from "./services/integrity.service.js";

async function start() {
  await connectDB().catch((e) => console.error("[db]", e.message));

  const app = createApp();
  // Bind to loopback only — the API is reached exclusively via the nginx reverse proxy.
  app.listen(config.port, "127.0.0.1", () => {
    console.log(`BBACVS API listening on 127.0.0.1:${config.port} (${config.env})`);
  });
  // Verification fetches each credential's encrypted VC from IPFS (seconds per fetch); warm
  // the cache for live credentials without delaying start-up.
  CredentialIndex.find({ status: { $ne: "revoked" }, cid: { $exists: true } }).select("cid").sort({ createdAt: -1 }).limit(400).lean()
    .then((rows) => warmIntegrityCache(rows.map((r) => r.cid)))
    .catch(() => {});
}

start();
