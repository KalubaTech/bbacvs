"use client";

import { useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, AvatarName, StatCard, StatRow, SectionCard, SearchBox, ToolButton,
  SelectPill, DataTable, Pagination, KV, KVRow, ActionBtn, FileRow, PanelHeader,
} from "../../../../components/portal/kit";
import { CHART, LineChart, Donut, Legend } from "../../../../components/portal/charts";
import { usePortalGuard } from "../../../../components/portal/auth";

const RISK_TONE = { High: "red", Medium: "amber", Low: "green" };
const RISK_TEXT = { High: "text-red-600", Medium: "text-amber-600", Low: "text-emerald-600" };
const RISK_DOT = { High: "bg-red-500", Medium: "bg-amber-500", Low: "bg-emerald-500" };
const STATUS_TONE = { "In Progress": "blue", Overdue: "red", Pending: "amber" };

const ISSUES = [
  { institution: "Copperbelt University", issue: "Deficient Quality Assurance System", risk: "High", due: "May 19, 2025", dueRed: true, officer: "Grace Banda", action: "Inspection Scheduled", status: "In Progress" },
  { institution: "Cavendish University Zambia", issue: "Non-compliance with Student Welfare Standards", risk: "High", due: "May 18, 2025", dueRed: true, officer: "Peter Kalumba", action: "Response Review", status: "Overdue" },
  { institution: "Mulungushi University", issue: "Financial Reporting Irregularities", risk: "Medium", due: "May 22, 2025", officer: "Chanda Mwanza", action: "Information Requested", status: "In Progress" },
  { institution: "Evelyn Hone College", issue: "Marketing Misrepresentation", risk: "Medium", due: "May 25, 2025", officer: "M. Siamutwa", action: "Institution Response", status: "Pending" },
  { institution: "University of Zambia", issue: "Infrastructure Below Standards", risk: "High", due: "May 20, 2025", officer: "Emmy Phiri", action: "Inspection Scheduled", status: "In Progress" },
  { institution: "ZCAS University", issue: "Incomplete Academic Records", risk: "Low", due: "May 28, 2025", officer: "Brian Phiri", action: "Monitoring", status: "Pending" },
  { institution: "Levy Mwanawasa Medical University", issue: "Clinical Training Capacity Gaps", risk: "Medium", due: "May 30, 2025", officer: "Tandiwe Mwewa", action: "Corrective Plan Review", status: "In Progress" },
];

const TREND = {
  labels: ["Dec 2024", "Jan 2025", "Feb 2025", "Mar 2025", "Apr 2025", "May 2025"],
  series: [
    { label: "Compliant", color: CHART.green, points: [65, 72, 78, 70, 82, 80] },
    { label: "At Risk", color: CHART.amber, points: [28, 34, 30, 36, 32, 30] },
    { label: "Non-compliant", color: CHART.red, points: [18, 16, 20, 15, 17, 14] },
  ],
};

const CATEGORIES = [
  { label: "Academic Quality", value: 16, color: CHART.green, pct: "29.6%" },
  { label: "Governance & Management", value: 11, color: CHART.blue, pct: "20.4%" },
  { label: "Financial Compliance", value: 9, color: CHART.amber, pct: "16.7%" },
  { label: "Student Welfare", value: 7, color: CHART.orange, pct: "13.0%" },
  { label: "Infrastructure & Facilities", value: 6, color: CHART.purple, pct: "11.1%" },
  { label: "Other", value: 5, color: CHART.slate, pct: "9.3%" },
];

function Section({ title, children, className = "" }) {
  return (
    <div className={`mb-4 rounded-xl border border-slate-200 p-3.5 ${className}`}>
      <div className="mb-2 text-[12px] font-bold text-slate-800">{title}</div>
      {children}
    </div>
  );
}

function DetailPanel({ row }) {
  return (
    <div>
      <PanelHeader
        title="Case #HEA-2025-0198"
        badge={
          <span className="flex items-center gap-1.5">
            <Badge tone="red">{row.risk} Risk</Badge>
            <Badge tone="outline" className="text-red-600">{row.status}</Badge>
          </span>
        }
      />

      <div className="mb-4 space-y-3 rounded-xl border border-slate-200 p-3.5">
        <KV label="Institution" value={row.institution} />
        <KV label="Category" value="Student Welfare" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-slate-400">Risk Level</div>
            <div className={`mt-1 flex items-center gap-1.5 text-[13px] font-semibold ${RISK_TEXT[row.risk]}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${RISK_DOT[row.risk]}`} /> {row.risk}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400">Status</div>
            <div className="mt-1"><Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge></div>
          </div>
        </div>
      </div>

      <Section title="Finding Summary">
        <p className="text-[12.5px] leading-relaxed text-slate-600">
          Non-compliance with student welfare standards, including inadequate counselling services,
          poor grievance handling and insufficient student support facilities.
        </p>
      </Section>

      <Section title="Inspection Notes">
        <p className="text-[12.5px] leading-relaxed text-slate-600">
          On-site inspection conducted on May 2, 2025. Multiple student complaints confirmed. Lack of
          full-time counsellors and unclear grievance escalation pathways.
        </p>
      </Section>

      <Section title="Evidence Attachments (3)">
        <div className="space-y-2">
          <FileRow name="Inspection_Report_May2_2025.pdf" size="1.2 MB" icon="fileText" tone="softred" />
          <FileRow name="Student_Complaints_Summary.xlsx" size="420 KB" icon="fileText" tone="softgreen" />
          <FileRow name="Facilities_Photos.zip" size="2.8 MB" icon="folder" tone="softblue" />
        </div>
      </Section>

      <Section title="Sanctions History">
        <div className="-mx-1 overflow-hidden rounded-lg border border-slate-100">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {["Date", "Action", "By", "Outcome"].map((h) => (
                  <th key={h} className="px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Apr 15, 2025", "Formal Warning", "HEA", "Acknowledged"],
                ["Feb 10, 2025", "Advisory Notice", "HEA", "Acknowledged"],
              ].map((r, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  {r.map((cell, j) => (
                    <td key={j} className="px-2.5 py-1.5 text-[11.5px] text-slate-600">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Deadlines">
        <KVRow label="Response Due" value={<span className="flex items-center gap-2">May 18, 2025 <Badge tone="red">Overdue</Badge></span>} />
        <KVRow label="Inspection Due" value={<span className="flex items-center gap-2">May 20, 2025 <Badge tone="amber">Today</Badge></span>} />
        <KVRow label="Corrective Actions Due" value={<span className="flex items-center gap-2">Jun 02, 2025 <Badge tone="green">13 days</Badge></span>} />
      </Section>

      <Section title="Notifications Sent">
        <div className="space-y-1">
          {[
            ["Formal Warning Letter", "Apr 15, 2025"],
            ["Inspection Notice", "Apr 28, 2025"],
            ["Information Request", "May 05, 2025"],
          ].map(([label, date], i) => (
            <div key={i} className="flex items-center gap-2.5 py-1">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Icon name="send" className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-slate-700">{label}</span>
              <span className="shrink-0 text-[11px] text-slate-400">{date}</span>
            </div>
          ))}
        </div>
      </Section>

      <div>
        <div className="mb-2 text-[12px] font-bold text-slate-800">Actions</div>
        <div className="grid grid-cols-2 gap-2">
          <ActionBtn tone="softblue" icon="send" full>Issue Warning</ActionBtn>
          <ActionBtn tone="softblue" icon="calendar" full>Schedule Inspection</ActionBtn>
          <ActionBtn tone="red" full>Suspend Accreditation</ActionBtn>
          <ActionBtn tone="green" icon="check" full>Close Case</ActionBtn>
        </div>
      </div>
    </div>
  );
}

export default function HeaCompliancePage() {
  const { ready, user } = usePortalGuard(["hea"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("Cavendish University Zambia");
  if (!ready) return null;
  const rows = ISSUES.filter(
    (r) => !q || (r.institution + r.issue + r.officer).toLowerCase().includes(q.toLowerCase())
  );
  const selected = ISSUES.find((r) => r.institution === sel) || ISSUES[1];

  return (
    <PortalShell
      portal="hea"
      active="compliance"
      title={
        <span className="flex items-center gap-2.5">
          HEA Portal – Compliance Monitoring &amp; Enforcement
          <Badge tone="slate">Sample data</Badge>
        </span>
      }
      user={{ name: user.name || user.email, sub: user.email }}
      subtitle="Monitor institutional compliance, inspection findings, sanctions and follow-up actions."
      actions={
        <>
          <ActionBtn tone="navy" icon="plus">New Compliance Case</ActionBtn>
          <SelectPill label="May 14 – May 20, 2025" />
        </>
      }
      panel={<DetailPanel row={selected} />}
      panelWidth="w-[400px]"
    >
      <StatRow cols={4}>
        <StatCard icon="bank" iconTone="softblue" label="Active Institutions Monitored" value="94" delta="8.5%" deltaUp deltaText="vs last 7 days" />
        <StatCard icon="alert" iconTone="amber" label="Compliance Alerts" value="27" delta="12.9%" deltaUp deltaText="vs last 7 days" />
        <StatCard icon="clock" iconTone="softred" label="Overdue Actions" value="15" delta="16.7%" deltaUp={false} deltaText="vs last 7 days" />
        <StatCard icon="scale" iconTone="purple" label="Open Enforcement Cases" value="12" delta="7.7%" deltaUp={false} deltaText="vs last 7 days" />
      </StatRow>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Compliance Trend Over Time" action={<SelectPill label="Monthly" />}>
          <LineChart height={190} labels={TREND.labels} series={TREND.series} />
          <Legend className="mt-3" items={TREND.series.map((s) => ({ label: s.label, color: s.color }))} />
        </SectionCard>
        <SectionCard
          title="Violation Categories (All Active Cases)"
          action={<button className="text-[12px] font-semibold text-blue-600 hover:underline">View category breakdown →</button>}
        >
          <div className="flex flex-wrap items-center gap-6">
            <Donut
              size={160}
              thickness={22}
              centerTitle="54"
              centerSub="Total"
              segments={CATEGORIES.map((c) => ({ value: c.value, color: c.color, label: c.label }))}
            />
            <Legend
              className="min-w-[220px] flex-1"
              items={CATEGORIES.map((c) => ({ label: c.label, color: c.color, value: `${c.value} (${c.pct})` }))}
            />
          </div>
        </SectionCard>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">All Active Issues</h3>
          <Badge tone="red">27</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-80" placeholder="Search institutions, officers, issues..." value={q} onChange={setQ} />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
          <ToolButton icon="refresh" />
        </div>
        <DataTable
          rowKey="institution"
          activeKey={sel}
          onRowClick={(r) => setSel(r.institution)}
          columns={[
            { key: "institution", label: "Institution", render: (r) => <span className="font-medium text-slate-700">{r.institution}</span> },
            { key: "issue", label: "Compliance Issue" },
            { key: "risk", label: "Risk Level", render: (r) => <Badge tone={RISK_TONE[r.risk]}>{r.risk}</Badge> },
            { key: "due", label: "Due Date", render: (r) => <span className={r.dueRed ? "font-semibold text-red-600" : ""}>{r.due}</span> },
            { key: "officer", label: "Assigned Officer", render: (r) => <AvatarName name={r.officer} /> },
            { key: "action", label: "Current Action" },
            { key: "status", label: "Status", render: (r) => <Badge tone={STATUS_TONE[r.status]} dot>{r.status}</Badge> },
            { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
          ]}
          rows={rows}
        />
        <div className="flex items-center gap-2 pr-3.5">
          <Pagination className="flex-1" summary="Showing 1 to 7 of 27 issues" page={1} pages={4} />
          <SelectPill label="10 / page" />
        </div>
      </div>
    </PortalShell>
  );
}
