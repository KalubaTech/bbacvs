import { createApp } from "./app.js";
import { connectDB, CredentialIndex } from "./models/index.js";
import { config } from "./config/index.js";
import { warmIntegrityCache } from "./services/integrity.service.js";
import { cosignMode, syncPendingProposals } from "./services/governance.service.js";

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
  // D09: say plainly when one process holds two GovernanceSafe owner keys.
  if (cosignMode() === "server") {
    console.warn("[governance] GOV_COSIGN_MODE=server — this API holds two GovernanceSafe owner keys; 2-of-3 approvals are not independently co-signed.");
  }
  // Pick up proposals co-signed outside the portal (e.g. contracts/scripts/cosign.js).
  setInterval(() => syncPendingProposals().catch(() => {}), 2 * 60 * 1000).unref();
}

start();
