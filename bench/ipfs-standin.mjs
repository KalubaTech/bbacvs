// Local IPFS stand-in for the isolated benchmark: serves encrypted payloads as
// GET /ipfs/<cid> from a JSON file written by run.mjs. Runs in its own process so the load
// generator does not share its event loop. Optional fixed delay emulates gateway latency.
//   node ipfs-standin.mjs <store.json> <port> [delayMs]
import http from "node:http";
import fs from "node:fs";

const [store, port, delayMs = "0"] = process.argv.slice(2);
const blobs = JSON.parse(fs.readFileSync(store, "utf8"));
http.createServer((req, res) => {
  const cid = decodeURIComponent((req.url.match(/^\/ipfs\/([^/?]+)/) || [])[1] || "");
  const body = blobs[cid];
  setTimeout(() => {
    if (!body) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }, Number(delayMs));
}).listen(Number(port), "127.0.0.1", () => console.log(`ipfs stand-in on 127.0.0.1:${port}`));
