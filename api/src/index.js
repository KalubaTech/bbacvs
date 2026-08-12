import { createApp } from "./app.js";
import { connectDB } from "./models/index.js";
import { config } from "./config/index.js";

async function start() {
  await connectDB().catch((e) => console.error("[db]", e.message));

  const app = createApp();
  // Bind to loopback only — the API is reached exclusively via the nginx reverse proxy.
  app.listen(config.port, "127.0.0.1", () => {
    console.log(`BBACVS API listening on 127.0.0.1:${config.port} (${config.env})`);
  });
}

start();
