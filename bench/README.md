# Verification benchmark (research objective 3, defect D11)

This compares BBACVS online verification with a **centralised baseline that performs the same
verifier task**. The aim is to measure what decentralised trust costs in latency and throughput,
under controlled and repeatable conditions.

## What is compared

| System | How it answers "is this credential genuine and in good standing?" |
|--------|---------------------------------------------------------------------|
| **BBACVS** (`api/src/routes/verify.routes.js`, unchanged) | On-chain status (`eth_call`) → IPFS fetch → AES-GCM decrypt → digest recompute → issuer key ↔ on-chain address → VC signature → index match → governance look-ups → status policy → audit row |
| **Centralised baseline** (`bench/centralised-server.mjs`) | Reads the same signed VC from its own database → digest recompute → VC signature → the *same* governance look-ups (programme, scope, cycle) → the *same* status policy → the same audit row |

Both run the same middleware (Express, Helmet, JSON parser, rate limiter) and use the same MongoDB
and the same record. The rate limit is raised on **both**, so the benchmark measures the
verifier and not the limiter. The baseline differs only in where trust comes from: its own
database instead of a blockchain anchor plus content-addressed storage.

BBACVS is measured in two cache conditions:

* **IPFS cache warm**: the encrypted VC is cached by CID, which is how the deployed service runs.
  Every request still decrypts, re-hashes, checks the signature and reads the chain.
* **IPFS cache off** (`INTEGRITY_CACHE=off`): every request also fetches from IPFS. This is the
  first verification of a credential after a restart.

## Conditions

* **`--mode isolated`**: a local Hardhat chain and a local IPFS stand-in (`bench/ipfs-standin.mjs`,
  optional fixed delay with `--ipfs-delay`), with 200 synthetic credentials issued through the real
  primitives (VC signing, canonical digest, AES-GCM, on-chain anchoring) into a throwaway
  database. This isolates the systems' own processing from network conditions. No real records
  are used.
* **`--mode sepolia`**: the real Sepolia RPC and Pinata gateway, using read-only copies of the
  deployment's records in a throwaway database. Nothing is written to the production database or
  the chain. Concurrency and request counts are small to stay within public RPC and gateway
  limits. This condition shows the effect of real network dependencies.

## Procedure (`bench/run.mjs`)

1. Seed the records and start each system as a **separate process** on loopback.
2. Run a **correctness pass**: every system verifies every record, and its verdict must match
   BBACVS's. Any disagreement is reported.
3. For each concurrency level and each repetition, run a closed loop: *C* clients each send one
   request, wait for the answer, and send the next, until the run total is reached. Each run
   starts with a short warm-up, and the order of the systems rotates between repetitions so slow
   drift does not favour any one of them.
4. Record every request's latency, HTTP status and verdict (`raw.csv`). A request counts as
   successful only when it returns HTTP 200 **and** the expected verdict. Failures are counted
   and kept, not dropped.
5. Summarise each run (`summary.csv`/`summary.json`): mean, p50, p95, p99, max, throughput
   (successful answers per second; `attemptsPerSec` counts every request), failed requests and
   error rate. Percentiles use nearest rank over successful requests.
6. Write `environment.json`: commit, Node, MongoDB and Hardhat versions, host CPU and memory,
   co-location, the plan, dependencies, and the anchoring gas cost.

`bench/report.mjs <results dir>` adds `aggregate.csv` (median across repetitions with the range),
static SVG charts for the report, and an interactive `report.html`.

```bash
npx hardhat node                                  # in contracts/, for --mode isolated
node bench/run.mjs --mode isolated                # defaults: clients 1,5,10,25,50 · 300 req/run · 3 reps · 200 records
node bench/run.mjs --mode sepolia                 # defaults: clients 1,2,5 · 24 req/run · 2 reps; cache-off: clients 1,4 · 12 req
node bench/report.mjs bench/results/<run>
```

## Threats to validity (state these with the results)

* **Co-location.** The load generator, both servers, MongoDB and, in isolated mode, the chain and
  the IPFS stand-in all share one host, and that host also runs other production services. The
  absolute numbers are specific to this host. The *comparison* is fairer than the absolute values
  because both systems share the same conditions, interleaved.
* **Isolated mode is optimistic for BBACVS**: a local automining chain and a loopback IPFS
  stand-in are far faster than Sepolia RPC and a public gateway. The Sepolia condition is the
  realistic one, but it is small and depends on third-party rate limits on the day.
* **Closed-loop load** measures latency under a fixed number of clients. It is not an open
  arrival-rate test, so queueing beyond the client count is not exercised.
* **Gas.** Anchoring cost is recorded but is a Sepolia (testnet) figure. Gas schedules change:
  Sepolia's anchor cost rose from about 107k to about 378k gas between September and October 2026.
* The baseline is the project's own model of an "equivalent centralised process". It is not a
  measurement of any real national verification system.
