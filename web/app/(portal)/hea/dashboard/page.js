"use client";

import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, StatCard, StatRow, SectionCard, SelectPill, SearchBox,
  ToolButton, DataTable, Pagination, ActionBtn,
} from "../../../../components/portal/kit";
import { CHART, Donut, Legend, LineChart } from "../../../../components/portal/charts";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const APPS_SERIES = [28, 40, 58, 45, 62, 80, 75];
const APPS_LABELS = ["May 14", "May 15", "May 16", "May 17", "May 18", "May 19", "May 20"];

const STATUS_LABEL = { pending: "Under Review", approved: "Approved", suspended: "Suspended" };
const STATUS_TONE = { pending: "amber", approved: "green", suspended: "red" };
const STATUS_COLOR = { approved: CHART.green, pending: CHART.amber, suspended: CHART.red };
const NEXT_ACTION = { pending: "Review", approved: "Monitor", suspended: "Investigate" };
const SECTOR_LABEL = { higher_ed: "Higher Education", university: "University", college: "College" };

const ALERTS = [
  { tone: "red", kind: "High Risk Case", sla: "02:18:34", org: "Cavendish University Zambia", body: "Non-compliance with academic staffing ratio", meta: "Case #HEA-2025-0154 · Raised by: Grace Banda · May 20, 2025", btn: "View Case" },
  { tone: "amber", kind: "Compliance Alert", sla: "04:22:11", org: "Copperbelt University", body: "Overdue annual compliance report", meta: "Due date: May 15, 2025", btn: "View Alert" },
  { tone: "amber", kind: "Document Request", sla: "03:11:07", org: "Mulungushi University", body: "Programme accreditation evidence pending", meta: "Requested: May 19, 2025", btn: "Respond" },
  { tone: "red", kind: "Escalated", sla: "01:05:22", org: "Evelyn Hone College", body: "Failure to address prior compliance findings", meta: "Escalated by: Chanda Mwansa · May 19, 2025", btn: "View Case" },
  { tone: "amber", kind: "Under Review", sla: "02:47:10", org: "University of Zambia", body: "Missing curriculum review and update evidence", meta: "Assigned to: Peter Kalumba · May 20, 2025", btn: "View Alert" },
];

function AlertCard({ alert }) {
  const red = alert.tone === "red";
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-[12px] font-semibold ${red ? "text-red-600" : "text-amber-600"}`}>
          <span className={`h-2 w-2 rounded-full ${red ? "bg-red-500" : "bg-amber-500"}`} />
          {alert.kind}
        </span>
        <span className={`shrink-0 text-[11px] font-bold ${red ? "text-red-600" : "text-amber-600"}`}>SLA {alert.sla}</span>
      </div>
      <div className="mt-1.5 text-[13px] font-bold text-slate-900">{alert.org}</div>
      <div className="mt-0.5 text-[12px] text-slate-600">{alert.body}</div>
      <div className="mt-1 text-[11px] text-slate-400">{alert.meta}</div>
      <div className="mt-2.5">
        <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-50">
          {alert.btn}
        </button>
      </div>
    </div>
  );
}

function AlertsPanel() {
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[15px] font-bold text-slate-900">Regulatory Alerts &amp; Escalations</h2>
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600">5</span>
        </div>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>
      <SelectPill label="All Alerts" className="mb-4 w-full justify-between" />
      <div className="space-y-3">
        {ALERTS.map((a, i) => (
          <AlertCard key={i} alert={a} />
        ))}
      </div>
      <div className="mt-4 text-center">
        <button className="text-[12px] font-semibold text-blue-600 hover:underline">View all alerts →</button>
      </div>
    </div>
  );
}

export default function HeaDashboardPage() {
  const { ready, user, token } = usePortalGuard(["hea"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [pending, setPending] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [monitoring, setMonitoring] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [inst, pend, progs, mon] = await Promise.all([
        api.heaInstitutions(token),
        api.heaPending(token),
        api.pendingProgrammes(token),
        api.heaMonitoring(token),
      ]);
      setInstitutions(inst.institutions || []);
      setPending(pend.pending || []);
      setProgrammes(progs.programmes || []);
      setMonitoring(mon);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  if (!ready) return null;

  const statusCounts = institutions.reduce((m, i) => {
    const s = i.heaStatus || "approved";
    m[s] = (m[s] || 0) + 1;
    return m;
  }, {});
  const accreditedProgrammes = institutions.reduce((n, i) => n + (i.accreditedPrograms?.length || 0), 0);

  const issuedTotal = (monitoring?.summary || []).reduce((n, s) => n + (s.total || 0), 0);
  const kpis = [
    { icon: "bank", iconTone: "softblue", label: "Registered Institutions", value: String(institutions.length), sub: `${issuedTotal} credentials issued` },
    { icon: "clock", iconTone: "amber", label: "Pending Accreditation", value: String(pending.length) },
    { icon: "award", iconTone: "softgreen", label: "Accredited Programmes", value: String(accreditedProgrammes) },
    { icon: "alert", iconTone: "softred", label: "Suspended Institutions", value: String(statusCounts.suspended || 0) },
    { icon: "folder", iconTone: "purple", label: "Programmes In Review", value: String(programmes.length) },
  ];

  const statusDist = ["approved", "pending", "suspended"]
    .filter((s) => statusCounts[s])
    .map((s) => ({
      label: STATUS_LABEL[s],
      value: statusCounts[s],
      color: STATUS_COLOR[s],
      pct: institutions.length ? `${((statusCounts[s] / institutions.length) * 100).toFixed(1)}%` : "0%",
    }));

  const queue = [...institutions].sort(
    (a, b) => ((a.heaStatus === "pending" ? 0 : 1) - (b.heaStatus === "pending" ? 0 : 1))
  );
  const rows = queue.filter(
    (r) => !q || (r.institution + (r.sector || "") + (r.heaStatus || "")).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <PortalShell
      portal="hea"
      active="dashboard"
      title="HEA Portal – Dashboard Overview"
      subtitle="Real-time overview of higher education regulation, accreditation, compliance and evidence shared with ZAQA."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={
        <>
          <ActionBtn tone="navy" icon="plus">New Application</ActionBtn>
          <SelectPill label="Last 7 days" />
        </>
      }
      panel={<AlertsPanel />}
      panelWidth="w-[380px]"
    >
      <StatRow cols={5}>
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </StatRow>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Accreditation Applications Over Time" action={<SelectPill label="Day" />}>
          <LineChart
            series={[{ points: APPS_SERIES, color: CHART.blue, label: "Applications", area: true }]}
            labels={APPS_LABELS}
            height={190}
          />
        </SectionCard>
        <SectionCard
          title="Accreditation Status Distribution"
          action={<button className="text-[12px] font-semibold text-blue-600 hover:underline">View full breakdown →</button>}
        >
          {statusDist.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">No records yet.</div>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <Donut
                size={160}
                thickness={22}
                centerTitle={String(institutions.length)}
                centerSub="Total"
                segments={statusDist.map((s) => ({ value: s.value, color: s.color, label: s.label }))}
              />
              <Legend
                className="min-w-[180px] flex-1"
                items={statusDist.map((s) => ({ label: s.label, color: s.color, value: `${s.value.toLocaleString()} (${s.pct})` }))}
              />
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            Institution Accreditation Queue
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{pending.length}</span>
          </span>
        }
        pad="p-4"
      >
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-72" placeholder="Search institutions..." value={q} onChange={setQ} />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load} />
        </div>
        {error && <div className="mb-3 text-[12px] font-medium text-red-600">{error}</div>}
        <DataTable
          rowKey="id"
          activeKey={sel}
          onRowClick={(r) => setSel(r.id)}
          columns={[
            { key: "institution", label: "Institution", render: (r) => <span className="font-semibold text-slate-800">{r.institution}</span> },
            { key: "sector", label: "Type", render: (r) => SECTOR_LABEL[r.sector] || r.sector || "—" },
            { key: "appType", label: "Application Type", render: (r) => (r.selfRegistered ? "Self-Registration" : "HEA Registered") },
            { key: "approvedBy", label: "Approved By", render: (r) => r.approvedBy || "—" },
            {
              key: "status", label: "Status",
              render: (r) => <Badge tone={STATUS_TONE[r.heaStatus] || "slate"}>{STATUS_LABEL[r.heaStatus] || r.heaStatus || "—"}</Badge>,
            },
            { key: "submitted", label: "Submitted On", render: (r) => fmtDate(r.createdAt) },
            { key: "next", label: "Next Action", render: (r) => NEXT_ACTION[r.heaStatus] || "—" },
            {
              key: "onChain", label: "On-Chain",
              render: (r) => <Badge tone={r.onChain ? "outline" : "amber"}>{r.onChain ? "Anchored" : "Pending"}</Badge>,
            },
            { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
          ]}
          rows={rows}
        />
        {rows.length === 0 && (
          <div className="border-b border-slate-100 py-8 text-center text-[13px] text-slate-400">No records yet.</div>
        )}
        <Pagination summary={`Showing ${rows.length} of ${queue.length} institutions`} page={1} pages={1} />
      </SectionCard>
    </PortalShell>
  );
}
