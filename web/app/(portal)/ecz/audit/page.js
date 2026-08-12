"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import { usePortalGuard, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";
import {
  Badge, StatCard, StatRow, SectionCard, SelectPill, SearchBox, ToolButton,
  DataTable, Pagination, ActionBtn,
} from "../../../../components/portal/kit";
import { CHART, LineChart, Donut, Legend } from "../../../../components/portal/charts";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May"];

const DISCREPANCY_SERIES = [
  { points: [150, 130, 110, 100, 90], color: CHART.red, label: "Discrepancy" },
  { points: [80, 75, 68, 66, 60], color: CHART.amber, label: "Information" },
  { points: [40, 44, 42, 48, 50], color: CHART.blue, label: "Data Issues" },
];

const SYNC_SEGMENTS = [
  { label: "Healthy", value: 98.7, color: CHART.green },
  { label: "Warning", value: 1, color: CHART.amber },
  { label: "Critical", value: 0.3, color: CHART.red },
];

const RESOLUTION_SEGMENTS = [
  { label: "Resolved", value: 824, color: CHART.green },
  { label: "In Progress", value: 276, color: CHART.amber },
  { label: "Pending", value: 98, color: CHART.blue },
  { label: "Overdue", value: 50, color: CHART.red },
];

const SUMMARY_TILES = [
  { icon: "inbox", label: "Total Requests", value: "1,248" },
  { icon: "shieldCheck", label: "Verifications", value: "1,186" },
  { icon: "alert", label: "Discrepancies", value: "186" },
  { icon: "help", label: "Information Requests", value: "72" },
  { icon: "checkCircle", label: "Resolved", value: "824" },
  { icon: "clock", label: "Pending", value: "98" },
];

const INSIGHTS = [
  { label: "Compliance Score", value: "98.7%" },
  { label: "Data Accuracy", value: "99.2%" },
  { label: "Sync Success Rate", value: "98.7%" },
  { label: "Average Resolution Time", value: "1.8 days" },
];

// Action prefix → badge tone for the activity trail.
const ACTION_TONES = {
  credential: "green",
  dispute: "amber",
  user: "purple",
  qualification: "blue",
};
const actionTone = (a) => ACTION_TONES[(a || "").split(".")[0]] || "slate";

function ReportPanel() {
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Report Preview</h2>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
          <Icon name="file" className="h-6 w-6" />
        </span>
        <div className="leading-tight">
          <div className="text-[14px] font-bold text-slate-900">ZAQA Verification Audit Report</div>
          <div className="mt-0.5 text-[11px] text-slate-500">Report ID: REP-2025-05-20-0001</div>
          <div className="text-[11px] text-slate-400">Generated: May 20, 2025 10:24 AM</div>
        </div>
      </div>

      <SectionCard title="Summary" className="mb-4">
        <div className="grid grid-cols-3 gap-2">
          {SUMMARY_TILES.map((t) => (
            <div key={t.label} className="rounded-lg border border-slate-100 p-2.5 text-center">
              <Icon name={t.icon} className="mx-auto h-4 w-4 text-emerald-600" />
              <div className="mt-1 text-[10px] leading-tight text-slate-400">{t.label}</div>
              <div className="mt-0.5 text-[13px] font-bold text-slate-900">{t.value}</div>
            </div>
          ))}
        </div>
        <button className="mt-3 text-[12px] font-semibold text-emerald-700 hover:text-emerald-800">
          View Full Breakdown →
        </button>
      </SectionCard>

      <SectionCard title="Key Insights" className="mb-4">
        {INSIGHTS.map((it) => (
          <div key={it.label} className="flex items-center gap-2.5 py-1.5">
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Icon name="check" className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <span className="min-w-0 flex-1 text-[12px] text-slate-500">{it.label}</span>
            <span className="shrink-0 text-[12px] font-semibold text-slate-800">{it.value}</span>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Description" className="mb-4">
        <p className="text-[12.5px] leading-relaxed text-slate-600">
          This report provides a comprehensive overview of ZAQA verification activities, audit events,
          data access reviews, and compliance metrics across ECZ&apos;s BBACVS integration.
        </p>
      </SectionCard>

      <SectionCard title="Report Actions" className="mb-4">
        <div className="space-y-2">
          <ActionBtn tone="darkgreen" icon="file" full>Generate Report</ActionBtn>
          <ActionBtn tone="softred" icon="download" full>Download PDF</ActionBtn>
          <ActionBtn tone="softgreen" icon="download" full>Export CSV</ActionBtn>
          <ActionBtn tone="softblue" icon="calendar" full>Schedule Report</ActionBtn>
        </div>
      </SectionCard>

      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Icon name="check" className="h-3.5 w-3.5 text-emerald-500" />
        Reports are generated from secure, immutable audit data.
      </div>
    </div>
  );
}

export default function EczAuditPage() {
  const { ready, user, token } = usePortalGuard(["ecz"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.activity(token);
      setEvents((res.activity || []).map((e, i) => ({ ...e, n: i + 1 })));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (!ready) return null;

  const rows = events.filter(
    (r) => !q || ((r.actor || "") + (r.action || "") + (r.summary || "") + (r.role || "")).toLowerCase().includes(q.toLowerCase())
  );

  const actors = new Set(events.map((e) => e.actor)).size;
  const credentialEvents = events.filter((e) => (e.action || "").startsWith("credential")).length;
  const disputeEvents = events.filter((e) => (e.action || "").startsWith("dispute")).length;
  const userEvents = events.filter((e) => (e.action || "").startsWith("user")).length;

  return (
    <PortalShell
      portal="ecz"
      active="audit"
      title="ECZ Portal – Audit, Reports & Compliance"
      subtitle="Comprehensive audit visibility, compliance monitoring and analytics for ECZ's BBACVS integration."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={
        <>
          <SelectPill label="May 14 – May 20, 2025" />
          <ToolButton icon="filter">Filters</ToolButton>
        </>
      }
      panel={<ReportPanel />}
      panelWidth="w-[380px]"
    >
      <StatRow cols={5}>
        <StatCard icon="shield" iconTone="softblue" label="Audit Events" value={events.length} sub="Accountability trail" />
        <StatCard icon="users" iconTone="purple" label="Distinct Actors" value={actors} sub="Users with logged actions" />
        <StatCard icon="file" iconTone="softgreen" label="Credential Events" value={credentialEvents} sub="Issue / submit / revoke" />
        <StatCard icon="gavel" iconTone="amber" label="Dispute Events" value={disputeEvents} sub="Opened / resolved" />
        <StatCard icon="shieldCheck" iconTone="softgreen" label="User Management Events" value={userEvents} sub="Accounts added / removed" />
      </StatRow>

      {error && <div className="mb-3 text-[13px] font-medium text-red-600">{error}</div>}

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SectionCard title="Monthly Verification Volume" action={<SelectPill label="This Year" />}>
          <LineChart
            series={[{ points: [15000, 25000, 22000, 35000, 42000], color: CHART.green, label: "Verifications", area: true }]}
            labels={MONTH_LABELS}
            height={140}
          />
        </SectionCard>
        <SectionCard title="Discrepancy Trends" action={<SelectPill label="This Year" />}>
          <LineChart series={DISCREPANCY_SERIES} labels={MONTH_LABELS} height={140} />
          <Legend
            className="mt-2"
            items={[
              { label: "Discrepancy", color: CHART.red },
              { label: "Information", color: CHART.amber },
              { label: "Data Issues", color: CHART.blue },
            ]}
          />
        </SectionCard>
        <SectionCard title="Sync Health">
          <div className="flex flex-col items-center gap-3">
            <Donut segments={SYNC_SEGMENTS} size={130} thickness={16} centerTitle="98.7%" centerSub="Healthy" />
            <Legend
              className="w-full"
              items={[
                { label: "Healthy", color: CHART.green, value: "98.7%" },
                { label: "Warning", color: CHART.amber, value: "1.0%" },
                { label: "Critical", color: CHART.red, value: "0.3%" },
              ]}
            />
          </div>
        </SectionCard>
        <SectionCard title="Request Resolution Breakdown" action={<SelectPill label="This Year" />}>
          <div className="flex flex-col items-center gap-3">
            <Donut segments={RESOLUTION_SEGMENTS} size={130} thickness={16} centerTitle="1,248" centerSub="Total" />
            <Legend
              className="w-full"
              items={[
                { label: "Resolved", color: CHART.green, value: "824 (66.0%)" },
                { label: "In Progress", color: CHART.amber, value: "276 (22.1%)" },
                { label: "Pending", color: CHART.blue, value: "98 (7.8%)" },
                { label: "Overdue", color: CHART.red, value: "50 (4.0%)" },
              ]}
            />
          </div>
        </SectionCard>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Accountability Trail — Who Changed What</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-96" placeholder="Search actors, actions or summaries..." value={q} onChange={setQ} />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="refresh" onClick={load} />
        </div>
        <DataTable
          rowKey="n"
          activeKey={sel}
          onRowClick={(r) => setSel(r.n)}
          columns={[
            { key: "n", label: "#", thClass: "w-10" },
            {
              key: "actor", label: "Actor",
              render: (r) => (
                <span className="block leading-tight">
                  <span className="block font-medium text-slate-700">{r.actor || "—"}</span>
                  <span className="block text-[11px] uppercase text-slate-400">{r.role || ""}</span>
                </span>
              ),
            },
            {
              key: "action", label: "Action",
              render: (r) => <Badge tone={actionTone(r.action)}>{r.action}</Badge>,
            },
            { key: "summary", label: "Summary", render: (r) => <span className="text-slate-600">{r.summary || "—"}</span> },
            { key: "at", label: "Timestamp", render: (r) => fmtDateTime(r.at) },
            { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
          ]}
          rows={rows}
          footer={
            rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-slate-400">No records yet.</div>
            ) : null
          }
        />
        <Pagination summary={`Showing ${rows.length} of ${events.length} events`} page={1} pages={1} />
      </div>
    </PortalShell>
  );
}
