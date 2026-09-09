// Shared test harness: boots the real Express app on an ephemeral loopback port. No database
// or chain connection is opened — these tests cover the surface that must work regardless
// (health, input validation, abuse protection).
import { createApp } from "../src/app.js";

export async function startServer() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function getJson(url, init) {
  const res = await fetch(url, init);
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON body */ }
  return { res, body };
}
