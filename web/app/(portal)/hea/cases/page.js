"use client";

import { useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, AvatarName, StatCard, StatRow, SearchBox, ToolButton, SelectPill,
  DataTable, Pagination, KV, KVRow, ActionBtn, FileRow, PanelHeader, TabBar, Timeline,
} from "../../../../components/portal/kit";
import { usePortalGuard } from "../../../../components/portal/auth";

const RISK_TONE = { High: "red", Medium: "amber", Low: "green" };
const STAGE_TONE = {
  Investigation: "blue",
  "Response Review": "amber",
  "Information Gathering": "slate",
  "Hearing Scheduled": "purple",
};

const CASES = [
  { id: "HEA-2025-0198", institution: "Cavendish University Zambia", category: "Student Welfare", officer: "Peter Kalumba", opened: "May 2, 2025", risk: "High", stage: "Investigation", sla: "2 days" },
  { id: "HEA-2025-0187", institution: "Copperbelt University", category: "Quality Assurance", officer: "Grace Banda", opened: "Apr 28, 2025", risk: "Medium", stage: "Response Review", sla: "5 days" },
  { id: "HEA-2025-0182", institution: "Mulungushi University", category: "Financial Compliance", officer: "Chanda Mwanza", opened: "Apr 25, 2025", risk: "High", stage: "Investigation", sla: "1 day" },
  { id: "HEA-2025-0176", institution: "Evelyn Hone College", category: "Academic Integrity", officer: "M. Siamutwa", opened: "Apr 21, 2025", risk: "Medium", stage: "Response Review", sla: "4 days" },
  { id: "HEA-2025-0169", institution: "University of Zambia", category: "Infrastructure & Facilities", officer: "Emmy Phiri", opened: "Apr 18, 2025", risk: "Medium", stage: "Investigation", sla: "3 days" },
  { id: "HEA-2025-0161", institution: "ZCAS University", category: "Student Welfare", officer: "Brian Phiri", opened: "Apr 15, 2025", risk: "Low", stage: "Information Gathering", sla: "7 days" },
  { id: "HEA-2025-0154", institution: "Levy Mwanawasa Medical University", category: "Clinical Training Standards", officer: "Tandiwe Mwewa", opened: "Apr 10, 2025", risk: "High", stage: "Hearing Scheduled", sla: "2 days" },
  { id: "HEA-2025-0148", institution: "Northern Technical College", category: "Programme Accreditation", officer: "Peter Kalumba", opened: "Apr 8, 2025", risk: "Low", stage: "Response Review", sla: "6 days" },
  { id: "HEA-2025-0141", institution: "Chreso University", category: "Marketing & Recruitment", officer: "Grace Banda", opened: "Apr 5, 2025", risk: "Medium", stage: "Information Gathering", sla: "5 days" },
  { id: "HEA-2025-0133", institution: "Western University", category: "Financial Compliance", officer: "Chanda Mwanza", opened: "Apr 2, 2025", risk: "High", stage: "Investigation", sla: "1 day" },
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
  const [tab, setTab] = useState("Overview");
  return (
    <div>
      <PanelHeader
        title={`Case ${row.id}`}
        badge={
          <span className="flex items-center gap-1.5">
            <Badge tone={RISK_TONE[row.risk]}>{row.risk} Risk</Badge>
            <Badge tone={STAGE_TONE[row.stage]}>{row.stage}</Badge>
          </span>
        }
      />

      <div className="mb-3">
        <KV label="Institution" value={row.institution} />
        <div className="mt-2 flex items-center justify-between gap-3 text-[11.5px]">
          <span className="text-slate-500">Opened {row.opened}</span>
          <span className="font-semibold text-red-600">SLA — {row.sla} remaining</span>
        </div>
      </div>

      <div className="mb-4">
        <TabBar
          tabs={["Overview", { label: "Evidence", count: 3 }, "Timeline", "Parties", "Notes", "Deadlines", "Sanctions"]}
          active={tab}
          onChange={setTab}
        />
      </div>

      <Section title="Case Summary">
        <p className="text-[12.5px] leading-relaxed text-slate-600">
          Non-compliance with student welfare standards, including inadequate counselling services,
          poor grievance handling and insufficient student support facilities.
        </p>
      </Section>

      <Section title="Linked Evidence">
        <div className="space-y-2">
          <FileRow name="Inspection_Report_May2_2025.pdf" size="1.2 MB" icon="fileText" tone="softred" />
          <FileRow name="Student_Complaints_Summary.xlsx" size="420 KB" icon="fileText" tone="softgreen" />
          <FileRow name="Facilities_Photos.zip" size="2.8 MB" icon="folder" tone="softblue" />
        </div>
        <button className="mt-2 text-[11px] font-semibold text-blue-600 hover:underline">View all evidence →</button>
      </Section>

      <Section title="Hearing Timeline">
        <Timeline
          items={[
            { title: "Case Opened", time: "May 2, 2025", state: "done" },
            { title: "Investigation Started", time: "May 6, 2025", state: "done" },
            { title: "Response Received", time: "May 12, 2025", state: "done" },
            { title: "Hearing Scheduled", time: "May 22, 2025", state: "current" },
            { title: "Decision Pending", time: "—", state: "pending" },
            { title: "Appeal Window", time: "—", state: "pending" },
          ]}
        />
      </Section>

      <Section title="Parties Involved">
        <KVRow label="Institution" value={row.institution} />
        <KVRow label="Representative" value="Dr. Paul Mwelwa — Vice Chancellor" />
        <KVRow label="Complainants" value="Students Welfare Committee (12 students)" />
      </Section>

      <Section title="Officer Notes">
        <div className="mb-1.5 text-[11px] text-slate-400">Last updated by {row.officer} on May 17, 2025</div>
        <p className="text-[12.5px] leading-relaxed text-slate-600">
          Investigation ongoing. Additional interviews with students and review of counselling records
          completed. Draft findings in progress.
        </p>
      </Section>

      <Section title="Deadlines">
        <KVRow label="Response Due" value={<span className="text-red-600">May 20, 2025</span>} />
        <KVRow label="Hearing Date" value="May 22, 2025" />
        <KVRow label="Decision Due" value="Jun 2, 2025" />
        <KVRow label="Appeal Window Ends" value="Jun 16, 2025" />
      </Section>

      <Section title="Sanctions History">
        <div className="overflow-hidden rounded-lg border border-slate-100">
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
                ["Feb 10, 2025", "Advisory Notice", "HEA", "Acknowledged"],
                ["Nov 5, 2024", "Formal Warning", "HEA", "Acknowledged"],
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

      <div>
        <div className="mb-2 text-[12px] font-bold text-slate-800">Actions</div>
        <div className="grid grid-cols-2 gap-2">
          <ActionBtn tone="softblue" icon="search" full>Open Investigation</ActionBtn>
          <ActionBtn tone="softblue" full>Request Response</ActionBtn>
          <ActionBtn tone="softred" full>Escalate Case</ActionBtn>
          <ActionBtn tone="softpurple" icon="calendar" full>Schedule Hearing</ActionBtn>
          <ActionBtn tone="softgreen" icon="check" full>Resolve Case</ActionBtn>
          <ActionBtn tone="green" full>Close Case</ActionBtn>
        </div>
      </div>
    </div>
  );
}

export default function HeaCasesPage() {
  const { ready, user } = usePortalGuard(["hea"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(CASES[0].id);
  if (!ready) return null;
  const rows = CASES.filter(
    (r) => !q || (r.id + r.institution + r.category + r.officer).toLowerCase().includes(q.toLowerCase())
  );
  const selected = CASES.find((r) => r.id === sel) || CASES[0];

  return (
    <PortalShell
      portal="hea"
      active="cases"
      title={
        <span className="flex items-center gap-2.5">
          HEA Portal – Regulatory Cases
          <Badge tone="slate">Sample data</Badge>
        </span>
      }
      user={{ name: user.name || user.email, sub: user.email }}
      subtitle="Manage active cases, investigations, hearings and appeals."
      actions={
        <>
          <ActionBtn tone="navy" icon="plus">New Regulatory Case</ActionBtn>
          <SelectPill label="May 14 – May 20, 2025" />
        </>
      }
      panel={<DetailPanel row={selected} />}
      panelWidth="w-[420px]"
    >
      <StatRow cols={5}>
        <StatCard icon="folder" iconTone="purple" label="Open Cases" value="42" delta="8.7%" deltaUp={false} deltaText="vs last 7 days" />
        <StatCard icon="search" iconTone="amber" label="Under Investigation" value="16" delta="14.3%" deltaUp deltaText="vs last 7 days" />
        <StatCard icon="alert" iconTone="softred" label="Escalated Cases" value="7" delta="12.5%" deltaUp={false} deltaText="vs last 7 days" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Resolved Cases" value="38" delta="22.6%" deltaUp deltaText="vs last 7 days" />
        <StatCard icon="scale" iconTone="softblue" label="Appeals Pending" value="6" delta="14.3%" deltaUp={false} deltaText="vs last 7 days" />
      </StatRow>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-80" placeholder="Search cases by ID, institution, or keyword..." value={q} onChange={setQ} />
          <SelectPill label="All Categories" />
          <SelectPill label="All Risk Levels" />
          <SelectPill label="All Stages" />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
          <ToolButton icon="refresh" />
        </div>
        <DataTable
          rowKey="id"
          activeKey={sel}
          onRowClick={(r) => setSel(r.id)}
          columns={[
            { key: "id", label: "Case ID", render: (r) => <span className="font-semibold text-blue-600">{r.id}</span> },
            { key: "institution", label: "Institution" },
            { key: "category", label: "Category" },
            { key: "officer", label: "Assigned Officer", render: (r) => <AvatarName name={r.officer} /> },
            { key: "opened", label: "Opened Date" },
            { key: "risk", label: "Risk Level", render: (r) => <Badge tone={RISK_TONE[r.risk]}>{r.risk}</Badge> },
            { key: "stage", label: "Current Stage", render: (r) => <Badge tone={STAGE_TONE[r.stage]}>{r.stage}</Badge> },
            { key: "sla", label: "SLA" },
            {
              key: "actions", label: "Action",
              render: () => (
                <span className="flex items-center gap-2.5">
                  <Icon name="eye" className="h-4 w-4 text-slate-400" />
                  <Icon name="dots" className="h-4 w-4 text-slate-400" />
                </span>
              ),
            },
          ]}
          rows={rows}
        />
        <div className="flex items-center gap-2 pr-3.5">
          <Pagination className="flex-1" summary="Showing 1 to 10 of 42 cases" page={1} pages={5} />
          <SelectPill label="10 / page" />
        </div>
      </div>
    </PortalShell>
  );
}
