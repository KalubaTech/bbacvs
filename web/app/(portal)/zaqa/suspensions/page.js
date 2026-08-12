"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, StatCard, StatRow, SectionCard, SearchBox, ToolButton, DataTable,
  Pagination, ProgressBar, KVRow, ActionBtn,
} from "../../../../components/portal/kit";
import { CHART, Donut, Legend, LineChart } from "../../../../components/portal/charts";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const RISK_TONE = { Critical: "dark", High: "red", Medium: "amber", Low: "green" };
const STATUS_TONE = { SUSPENDED: "red", "UNDER REVIEW": "amber" };

const SUSPENDED_STATES = ["suspended", "suspicious", "under_dispute"];
const STATE_LABEL = {
  suspended: "SUSPENDED",
  suspicious: "UNDER REVIEW",
  under_dispute: "UNDER REVIEW",
};
const REASON_LABEL = {
  suspended: "Suspended by ZAQA",
  suspicious: "Flagged suspicious",
  under_dispute: "Under dispute",
};

const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-4)}` : "—");
const riskLabel = (r) => (r ? r.charAt(0).toUpperCase() + r.slice(1) : "Unknown");

// Mock: no historical trend endpoint exists.
const TREND_POINTS = [40, 46, 53, 60, 57, 62];
const TREND_LABELS = ["Apr 16-22", "Apr 23-29", "Apr 30-May 6", "May 7-13", "May 14-20", "May 21-27"];

function CardLink({ children }) {
  return <button className="text-[12px] font-semibold text-blue-600 hover:underline">{children}</button>;
}

function DetailPanel({ c, onSetStatus, busy }) {
  const status = STATE_LABEL[c.zaqaValidation] || c.zaqaValidation;
  const risk = riskLabel(c.validationReport?.risk);
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Case Detail</h2>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] text-slate-400">Credential Hash</div>
          <div className="text-[15px] font-bold text-slate-900">{shortHash(c.credentialHash)}</div>
        </div>
        <Badge tone={STATUS_TONE[status] || "amber"} dot>{status}</Badge>
      </div>

      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3.5">
        <div className="text-[13px] font-bold text-red-700">Status: {status}</div>
        <div className="mt-0.5 text-[12px] text-red-600">
          {c.zaqaValidation === "suspended"
            ? "This credential is suspended. Access is restricted until further notice."
            : "This credential is flagged and held pending ZAQA review."}
        </div>
      </div>

      <SectionCard title="Case Overview" className="mb-4">
        <div className="divide-y divide-slate-100">
          <KVRow label="Holder" value={c.subjectName || "—"} />
          <KVRow label="Qualification" value={c.qualification || "—"} />
          <KVRow label="Institution" value={c.institution || "—"} />
          <KVRow label="Suspension Reason" value={c.zaqaNote || REASON_LABEL[c.zaqaValidation] || "—"} />
          <KVRow label="Risk Level" value={<Badge tone={RISK_TONE[risk] === "dark" ? "red" : RISK_TONE[risk] || "slate"}>{risk}</Badge>} />
          <KVRow label="ZQF Level" value={c.zqfLevel ? `ZQF ${c.zqfLevel}` : "—"} />
          <KVRow label="Issued" value={fmtDate(c.issuedAt)} />
        </div>
      </SectionCard>

      <SectionCard title="Investigation Notes" className="mb-4">
        <p className="text-[12.5px] leading-relaxed text-slate-600">
          {c.zaqaNote ||
            (c.validationReport
              ? `Automated validation recommendation: ${c.validationReport.recommendation || "—"}.`
              : "No investigation notes recorded yet.")}
        </p>
      </SectionCard>

      {c.validationReport?.checks?.length > 0 && (
        <SectionCard title={`Automated Checks (${c.validationReport.checks.length})`} className="mb-4">
          <div className="space-y-1.5">
            {c.validationReport.checks.map((chk, i) => (
              <div key={i} className={`text-[12px] ${chk.pass ? "text-emerald-700" : "text-red-600"}`}>
                {chk.pass ? "✓" : "✕"} {chk.rule}{chk.detail ? ` — ${chk.detail}` : ""}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Actions">
        <div className="space-y-2">
          <ActionBtn
            tone="green" full icon="checkCircle"
            disabled={busy}
            className={busy ? "opacity-50" : ""}
            onClick={() => onSetStatus(c, "validated")}
          >
            {busy ? "Working…" : "Reinstate"}
          </ActionBtn>
          <ActionBtn tone="softblue" full icon="search">Continue Investigation</ActionBtn>
          <ActionBtn tone="softorange" full icon="alert">Escalate</ActionBtn>
          <ActionBtn
            tone="softred" full icon="revoke"
            disabled={busy || c.zaqaValidation === "under_dispute"}
            className={busy || c.zaqaValidation === "under_dispute" ? "opacity-50" : ""}
            onClick={() => onSetStatus(c, "under_dispute")}
          >
            Convert to Revocation Review
          </ActionBtn>
        </div>
      </SectionCard>
    </div>
  );
}

export default function ZaqaSuspensionsPage() {
  const { ready, user, token } = usePortalGuard(["zaqa"]);
  const [creds, setCreds] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.zaqaValidationList(token);
      setCreds(res.credentials || []);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function setStatus(c, zaqaValidation) {
    setBusy(c.credentialHash);
    try { await api.zaqaSetValidation(token, c.credentialHash, { zaqaValidation }); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  if (!ready) return null;

  const cases = creds.filter((c) => SUSPENDED_STATES.includes(c.zaqaValidation));
  const suspendedCount = cases.filter((c) => c.zaqaValidation === "suspended").length;
  const suspiciousCount = cases.filter((c) => c.zaqaValidation === "suspicious").length;
  const disputeCount = cases.filter((c) => c.zaqaValidation === "under_dispute").length;
  const reinstatedCount = creds.filter((c) => c.zaqaValidation === "validated").length;

  const rows = cases.filter(
    (c) =>
      !q ||
      `${c.credentialHash} ${c.subjectName} ${c.qualification} ${c.institution} ${c.zaqaNote}`
        .toLowerCase().includes(q.toLowerCase())
  );
  const selected = cases.find((c) => c.credentialHash === sel) || rows[0] || null;

  // Risk donut from real validation-report risk counts.
  const riskCounts = {};
  for (const c of cases) {
    const r = riskLabel(c.validationReport?.risk);
    riskCounts[r] = (riskCounts[r] || 0) + 1;
  }
  const RISK_COLORS = { Critical: CHART.red, High: CHART.orange, Medium: CHART.amber, Low: CHART.green, Unknown: CHART.slate };
  const riskSegments = Object.entries(riskCounts).map(([label, value]) => ({
    label, value, color: RISK_COLORS[label] || CHART.slate,
  }));
  const riskLegend = riskSegments.map((s) => ({
    label: s.label, color: s.color,
    value: `${s.value} (${cases.length ? ((s.value / cases.length) * 100).toFixed(1) : 0}%)`,
  }));

  // Reason bars from real status counts.
  const reasons = [
    { label: "Suspended by ZAQA", value: suspendedCount, tone: "red" },
    { label: "Flagged suspicious", value: suspiciousCount, tone: "amber" },
    { label: "Under dispute", value: disputeCount, tone: "purple" },
  ];
  const reasonMax = Math.max(1, ...reasons.map((r) => r.value));

  return (
    <PortalShell
      portal="zaqa"
      active="suspensions"
      title="ZAQA Portal – Suspensions"
      subtitle="Monitor and manage suspended or suspected credentials to protect the integrity of the qualifications ecosystem."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={<ActionBtn tone="navy" icon="download">Export Report</ActionBtn>}
      panel={selected ? <DetailPanel c={selected} onSetStatus={setStatus} busy={busy === selected.credentialHash} /> : null}
      panelWidth="w-[380px]"
    >
      <StatRow cols={4}>
        <StatCard icon="shield" iconTone="softred" label="Active Suspensions" value={suspendedCount} sub="Currently suspended" />
        <StatCard icon="flag" iconTone="amber" label="New Flags" value={suspiciousCount} sub="Flagged suspicious" />
        <StatCard icon="search" iconTone="purple" label="Under Investigation" value={disputeCount} sub="Under dispute" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Validated Credentials" value={reinstatedCount} sub="Fully validated" />
      </StatRow>

      {error && <div className="mb-3 text-[12.5px] font-medium text-red-600">{error}</div>}

      <SectionCard title={`Suspended or Suspected Credentials (${cases.length})`} className="mb-4" pad="px-4 pb-1 pt-4">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-72" placeholder="Search credentials..." value={q} onChange={setQ} />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
        </div>
        <DataTable
          rowKey="credentialHash"
          activeKey={selected?.credentialHash}
          onRowClick={(r) => setSel(r.credentialHash)}
          columns={[
            { key: "credentialHash", label: "Credential", render: (r) => <span className="font-semibold text-blue-600">{shortHash(r.credentialHash)}</span> },
            { key: "subjectName", label: "Holder" },
            { key: "qualification", label: "Qualification" },
            { key: "institution", label: "Institution" },
            { key: "reason", label: "Suspension Reason", render: (r) => r.zaqaNote || REASON_LABEL[r.zaqaValidation] || "—" },
            { key: "risk", label: "Risk Level", render: (r) => { const rl = riskLabel(r.validationReport?.risk); return <Badge tone={RISK_TONE[rl] || "slate"}>{rl}</Badge>; } },
            { key: "issuedAt", label: "Issued", render: (r) => fmtDate(r.issuedAt) },
            { key: "status", label: "Current Status", render: (r) => { const s = STATE_LABEL[r.zaqaValidation]; return <Badge tone={STATUS_TONE[s] || "amber"}>{s}</Badge>; } },
          ]}
          rows={rows}
        />
        {rows.length === 0 && (
          <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
        )}
        <Pagination summary={`Showing ${rows.length} of ${cases.length} records`} page={1} pages={1} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard title="Suspensions by Risk Level" action={<CardLink>View full analysis →</CardLink>}>
          {cases.length ? (
            <div className="flex items-center gap-5">
              <Donut segments={riskSegments} size={140} thickness={18} centerTitle={String(cases.length)} centerSub="Total" />
              <Legend className="flex-1" items={riskLegend} />
            </div>
          ) : (
            <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
          )}
        </SectionCard>

        <SectionCard title="Suspension Trend (sample)" action={<CardLink>View trend →</CardLink>}>
          <LineChart
            height={170}
            labels={TREND_LABELS}
            series={[{ points: TREND_POINTS, color: CHART.blue, label: "Suspensions", area: true }]}
          />
        </SectionCard>

        <SectionCard title="Top Suspension Reasons" action={<CardLink>View full breakdown →</CardLink>}>
          <div className="space-y-3">
            {reasons.map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12px] text-slate-600">{r.label}</span>
                  <span className="text-[12px] font-semibold text-slate-800">{r.value}</span>
                </div>
                <ProgressBar value={(r.value / reasonMax) * 100} tone={r.tone} />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </PortalShell>
  );
}
