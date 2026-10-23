// Turns a bench/results/<run>/summary.json into charts and tables for the report.
//   node bench/report.mjs bench/results/<run>
// Writes into the run directory:
//   report.html                       interactive (hover tooltips, light/dark, table view)
//   chart-p50.svg, chart-p95.svg, chart-throughput.svg   static, light theme, for the report
//   aggregate.csv                     per system × concurrency: median across repetitions + range
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node bench/report.mjs <results dir>");
const { mode, correctness, results } = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"));
// Runs recorded before `attemptsPerSec` existed stored attempts/s as throughput; convert to
// successful answers/s (exact: succeeded × attempts/s ÷ requests).
for (const r of results) {
  if (r.attemptsPerSec === undefined) { r.attemptsPerSec = r.throughputPerSec; r.throughputPerSec = (r.throughputPerSec * r.succeeded) / r.requests; }
}
const env = JSON.parse(fs.readFileSync(path.join(dir, "environment.json"), "utf8"));

// Fixed categorical order (validated: slots 1–3, all pairs, light + dark). Colour follows the system.
const SYSTEMS = [
  { key: "baseline", label: "Centralised baseline", short: "Baseline", slot: 1 },
  { key: "bbacvs_warm", label: "BBACVS, IPFS cache warm", short: "BBACVS warm", slot: 2 },
  { key: "bbacvs_cold", label: "BBACVS, IPFS cache off", short: "BBACVS cold", slot: 3 },
].filter((s) => results.some((r) => r.system === s.key));

const median = (xs) => { const a = [...xs].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const levels = [...new Set(results.map((r) => r.concurrency))].sort((a, b) => a - b);
const agg = [];
for (const s of SYSTEMS) for (const c of levels) {
  const runs = results.filter((r) => r.system === s.key && r.concurrency === c);
  if (!runs.length) continue;
  const pick = (k) => runs.map((r) => r[k]).filter((v) => v != null);
  const row = { system: s.key, label: s.label, concurrency: c, reps: runs.length, requests: runs.reduce((a, r) => a + r.requests, 0), failed: runs.reduce((a, r) => a + r.failed, 0) };
  for (const k of ["p50Ms", "p95Ms", "p99Ms", "throughputPerSec"]) {
    const v = pick(k);
    row[k] = median(v); row[`${k}Min`] = Math.min(...v); row[`${k}Max`] = Math.max(...v);
  }
  agg.push(row);
}
const cols = ["system", "concurrency", "reps", "requests", "failed", "p50Ms", "p50MsMin", "p50MsMax", "p95Ms", "p95MsMin", "p95MsMax", "p99Ms", "throughputPerSec", "throughputPerSecMin", "throughputPerSecMax"];
fs.writeFileSync(path.join(dir, "aggregate.csv"), [cols.join(","), ...agg.map((r) => cols.map((c) => (typeof r[c] === "number" ? +r[c].toFixed(2) : r[c])).join(","))].join("\n") + "\n");

const METRICS = [
  // Latency spans ~20 ms to seconds across the concurrency range, so it is drawn on a log scale
  // (stated on the axis); throughput stays linear.
  { key: "p50Ms", file: "chart-p50.svg", title: "Median latency (p50)", unit: "ms", log: true },
  { key: "p95Ms", file: "chart-p95.svg", title: "Tail latency (p95)", unit: "ms", log: true },
  { key: "throughputPerSec", file: "chart-throughput.svg", title: "Throughput (successful answers)", unit: "req/s" },
];

// ---- SVG line chart (one measure, one axis) ----------------------------------------------------
const W = 520, H = 300, M = { top: 20, right: 104, bottom: 44, left: 56 };
const LOG_TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const fmt = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
function niceMax(v) { const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p / (v / p > 5 ? 2 : 1)) * p * (v / p > 5 ? 2 : 1); }

function chartSVG(metric, { staticColors } = {}) {
  const hi = Math.max(...agg.map((r) => r[`${metric.key}Max`] ?? r[metric.key]));
  const lo = Math.min(...agg.map((r) => r[`${metric.key}Min`] ?? r[metric.key]));
  const x = (i) => M.left + (levels.length === 1 ? 0 : (i * (W - M.left - M.right)) / (levels.length - 1));
  let y, ticks;
  if (metric.log) {
    const lmin = Math.log10(LOG_TICKS.filter((t) => t <= lo).at(-1) || 1);
    const lmax = Math.log10(LOG_TICKS.find((t) => t >= hi) || hi);
    y = (v) => H - M.bottom - ((Math.log10(v) - lmin) / (lmax - lmin)) * (H - M.top - M.bottom);
    ticks = LOG_TICKS.filter((t) => Math.log10(t) >= lmin - 1e-9 && Math.log10(t) <= lmax + 1e-9);
  } else {
    const max = niceMax(hi * 1.05);
    y = (v) => H - M.bottom - (v / max) * (H - M.top - M.bottom);
    ticks = Array.from({ length: 5 }, (_, i) => (max * i) / 4);
  }
  const color = (slot) => (staticColors ? ["#2a78d6", "#eb6834", "#1baf7a"][slot - 1] : `var(--series-${slot})`);
  const ink = (role) => (staticColors ? { primary: "#0b0b0b", secondary: "#52514e", muted: "#8a8984", grid: "#e6e5e0", surface: "#fcfcfb" }[role] : `var(--${role === "primary" || role === "secondary" || role === "muted" ? `text-${role}` : role})`);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${metric.title} by concurrent clients" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11">`;
  if (staticColors) out += `<rect width="${W}" height="${H}" fill="${ink("surface")}"/>`;
  for (const t of ticks) out += `<line x1="${M.left}" x2="${W - M.right}" y1="${y(t)}" y2="${y(t)}" stroke="${ink("grid")}" stroke-width="1"/><text x="${M.left - 8}" y="${y(t) + 4}" text-anchor="end" fill="${ink("muted")}">${metric.log ? t : fmt(t)}</text>`;
  levels.forEach((c, i) => { out += `<text x="${x(i)}" y="${H - M.bottom + 18}" text-anchor="middle" fill="${ink("muted")}">${c}</text>`; });
  out += `<text x="${(M.left + W - M.right) / 2}" y="${H - 6}" text-anchor="middle" fill="${ink("secondary")}">Concurrent clients</text>`;
  out += `<text x="14" y="${(M.top + H - M.bottom) / 2}" text-anchor="middle" fill="${ink("secondary")}" transform="rotate(-90 14 ${(M.top + H - M.bottom) / 2})">${metric.unit}${metric.log ? ", log scale" : ""}</text>`;
  const labelYs = [];
  for (const s of SYSTEMS) {
    const pts = levels.map((c, i) => ({ c, i, r: agg.find((a) => a.system === s.key && a.concurrency === c) })).filter((p) => p.r);
    if (!pts.length) continue;
    // Range across repetitions as a thin band behind the line.
    const band = [...pts.map((p) => `${x(p.i)},${y(p.r[`${metric.key}Max`])}`), ...pts.slice().reverse().map((p) => `${x(p.i)},${y(p.r[`${metric.key}Min`])}`)].join(" ");
    out += `<polygon points="${band}" fill="${color(s.slot)}" fill-opacity="0.12"/>`;
    out += `<polyline points="${pts.map((p) => `${x(p.i)},${y(p.r[metric.key])}`).join(" ")}" fill="none" stroke="${color(s.slot)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const p of pts) {
      out += `<circle cx="${x(p.i)}" cy="${y(p.r[metric.key])}" r="4" fill="${color(s.slot)}" stroke="${ink("surface")}" stroke-width="2"/>`;
    }
    // Direct label at the line end, nudged apart when ends collide.
    const last = pts.at(-1);
    let ly = y(last.r[metric.key]) + 4;
    while (labelYs.some((v) => Math.abs(v - ly) < 13)) ly += 13;
    labelYs.push(ly);
    out += `<text x="${x(last.i) + 10}" y="${ly}" fill="${ink("primary")}"><tspan fill="${color(s.slot)}">●</tspan> ${s.short}</text>`;
  }
  // Crosshair hover: one full-height column per concurrency level, listing every system there.
  if (!staticColors) {
    const colW = levels.length > 1 ? (W - M.left - M.right) / (levels.length - 1) : 40;
    levels.forEach((c, i) => {
      const lines = SYSTEMS.map((s) => {
        const r = agg.find((a) => a.system === s.key && a.concurrency === c);
        return r ? `${s.slot}~${s.label}~${fmt(r[metric.key])} ${metric.unit} (reps ${fmt(r[`${metric.key}Min`])}–${fmt(r[`${metric.key}Max`])}), ${r.failed} failed of ${r.requests}` : null;
      }).filter(Boolean).join("^");
      out += `<line class="xhair" data-col="${i}" x1="${x(i)}" x2="${x(i)}" y1="${M.top}" y2="${H - M.bottom}" stroke="${ink("muted")}" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>`;
      out += `<rect class="hit" data-col="${i}" x="${x(i) - colW / 2}" y="${M.top}" width="${colW}" height="${H - M.top - M.bottom}" fill="transparent" data-title="${c} concurrent clients" data-tip="${lines}"/>`;
    });
  }
  return out + "</svg>";
}

for (const m of METRICS) fs.writeFileSync(path.join(dir, m.file), chartSVG(m, { staticColors: true }));

// ---- HTML report -------------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const tableRows = agg.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.concurrency}</td><td>${fmt(r.p50Ms)}</td><td>${fmt(r.p95Ms)}</td><td>${fmt(r.p99Ms)}</td><td>${fmt(r.throughputPerSec)}</td><td>${r.failed} / ${r.requests}</td></tr>`).join("");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Verification Benchmark</title>
<style>
:root{color-scheme:light;--surface:#f4f3ef;--surface-1:#fcfcfb;--text-primary:#0b0b0b;--text-secondary:#52514e;--text-muted:#8a8984;--grid:#e6e5e0;--border:#dcdbd5;--series-1:#2a78d6;--series-2:#eb6834;--series-3:#1baf7a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--surface:#111110;--surface-1:#1a1a19;--text-primary:#f0efec;--text-secondary:#c3c2b7;--text-muted:#8f8e86;--grid:#2c2c2a;--border:#33332f;--series-1:#3987e5;--series-2:#d95926;--series-3:#199e70}}
:root[data-theme="dark"]{color-scheme:dark;--surface:#111110;--surface-1:#1a1a19;--text-primary:#f0efec;--text-secondary:#c3c2b7;--text-muted:#8f8e86;--grid:#2c2c2a;--border:#33332f;--series-1:#3987e5;--series-2:#d95926;--series-3:#199e70}
body{margin:0;background:var(--surface);color:var(--text-primary);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1120px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:0 0 8px}
p,.meta{color:var(--text-secondary)}.meta{font-size:12px}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin:12px 0;font-size:13px}.legend span::before{content:"";display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:var(--c)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.card{background:var(--surface-1);border:1px solid var(--border);border-radius:10px;padding:14px;overflow:hidden}
.card svg{width:100%;height:auto;display:block}
.hit{cursor:crosshair}
#tip{position:fixed;pointer-events:none;background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-size:12px;color:var(--text-primary);box-shadow:0 2px 8px rgba(0,0,0,.15);display:none;max-width:320px}
#tip b{display:block}
.tablewrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:right;padding:6px 8px;border-bottom:1px solid var(--grid)}th:first-child,td:first-child{text-align:left}th{color:var(--text-secondary);font-weight:600}
</style></head><body><main>
<h1>Verification latency and throughput</h1>
<p>BBACVS online verification compared with a centralised verifier doing the same task (${esc(mode)} condition). Lines are the median across ${Math.max(...agg.map((r) => r.reps))} repetitions; shaded bands show the range across repetitions. Failures are counted, not hidden.</p>
<div class="legend">${SYSTEMS.map((s) => `<span style="--c:var(--series-${s.slot})">${esc(s.label)}</span>`).join("")}</div>
<div class="grid">${METRICS.map((m) => `<section class="card"><h2>${m.title} <span class="meta">(${m.unit}${m.log ? ", log scale" : ""}, ${m.key === "throughputPerSec" ? "higher is better" : "lower is better"})</span></h2>${chartSVG(m)}</section>`).join("")}</div>
<section class="card" style="margin-top:16px"><h2>Table view</h2><div class="tablewrap"><table><thead><tr><th>System</th><th>Clients</th><th>p50 ms</th><th>p95 ms</th><th>p99 ms</th><th>req/s</th><th>Failed / requests</th></tr></thead><tbody>${tableRows}</tbody></table></div></section>
<section class="card" style="margin-top:16px"><h2>Conditions</h2>
<p class="meta">Commit ${esc(env.commit)}${env.dirty ? " (working tree had uncommitted changes)" : ""} · run ${esc(env.startedAt)} · Node ${esc(env.node)} · ${esc(env.host.cpu)} × ${env.host.cores}, ${env.host.memGB} GB<br>
Chain: ${esc(env.dependencies.chain)} · IPFS: ${esc(env.dependencies.ipfs)}<br>
${esc(env.colocation)}<br>
Correctness pass: ${Object.entries(correctness).map(([k, v]) => `${esc(k)} ${v.agree}/${v.checked} agree`).join(" · ")}</p></section>
</main><div id="tip"></div>
<script>
const tip=document.getElementById("tip");
document.querySelectorAll(".hit").forEach(el=>{
  const xh=el.parentNode.querySelector('.xhair[data-col="'+el.dataset.col+'"]');
  el.addEventListener("mouseenter",()=>{
    tip.innerHTML="<b>"+el.dataset.title+"</b>"+el.dataset.tip.split("^").map(l=>{const [slot,label,val]=l.split("~");return '<div><span style="color:var(--series-'+slot+')">●</span> '+label+': '+val+'</div>'}).join("");
    tip.style.display="block";xh.setAttribute("visibility","visible")});
  el.addEventListener("mousemove",e=>{tip.style.left=Math.min(e.clientX+14,innerWidth-330)+"px";tip.style.top=(e.clientY+14)+"px"});
  el.addEventListener("mouseleave",()=>{tip.style.display="none";xh.setAttribute("visibility","hidden")});
});
</script></body></html>`;
fs.writeFileSync(path.join(dir, "report.html"), html);
console.log(`wrote report.html, ${METRICS.map((m) => m.file).join(", ")}, aggregate.csv in ${dir}`);
