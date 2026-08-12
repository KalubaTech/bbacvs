"use client";

import { useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, Avatar, AvatarName, StatCard, StatRow, SearchBox, ToolButton, SelectPill,
  DataTable, Pagination, KVRow, ActionBtn, FileRow, PanelHeader, Timeline,
} from "../../../../components/portal/kit";
import { usePortalGuard } from "../../../../components/portal/auth";

const TYPE_TONE = { Suspension: "red", "Compliance Order": "orange", "Warning Notice": "amber" };
const STATUS_TONE = { Active: "green", "Under Review": "amber" };

const SANCTIONS = [
  { institution: "Cavendish University Zambia", id: "SAN-2025-0024", type: "Suspension", reason: "Non-compliance with academic staffing ratio", effective: "May 14, 2025", expiry: "May 20, 2025", officer: "Grace Banda", status: "Active" },
  { institution: "Copperbelt University", id: "SAN-2025-0023", type: "Compliance Order", reason: "Overdue annual compliance report", effective: "May 12, 2025", expiry: "May 26, 2025", officer: "Peter Kalumba", status: "Active" },
  { institution: "Mulungushi University", id: "SAN-2025-0022", type: "Warning Notice", reason: "Financial reporting irregularities", effective: "May 10, 2025", expiry: "May 24, 2025", officer: "Chanda Mwansa", status: "Active" },
  { institution: "Evelyn Hone College", id: "SAN-2025-0021", type: "Compliance Order", reason: "Failure to address prior findings", effective: "May 08, 2025", expiry: "May 22, 2025", officer: "M. Siamutwa", status: "Active" },
  { institution: "University of Zambia", id: "SAN-2025-0020", type: "Compliance Order", reason: "Infrastructure below standards", effective: "May 06, 2025", expiry: "May 27, 2025", officer: "Emmy Phiri", status: "Active" },
  { institution: "ZCAS University", id: "SAN-2025-0019", type: "Suspension", reason: "Incomplete academic records", effective: "May 03, 2025", expiry: "May 17, 2025", officer: "Brian Phiri", status: "Active" },
  { institution: "Levy Mwanawasa Medical University", id: "SAN-2025-0018", type: "Warning Notice", reason: "Clinical training capacity gaps", effective: "May 01, 2025", expiry: "May 15, 2025", officer: "Tandiwe Mwewa", status: "Active" },
  { institution: "Nkumba University", id: "SAN-2025-0017", type: "Compliance Order", reason: "Late submission of QA self-assessment", effective: "Apr 28, 2025", expiry: "May 12, 2025", officer: "Grace Banda", status: "Active" },
  { institution: "Zambia Christian University", id: "SAN-2025-0016", type: "Warning Notice", reason: "Student support services deficiencies", effective: "Apr 24, 2025", expiry: "May 08, 2025", officer: "Peter Kalumba", status: "Active" },
  { institution: "Indaba Agricultural Policy Research Inst.", id: "SAN-2025-0015", type: "Compliance Order", reason: "Research ethics compliance gaps", effective: "Apr 20, 2025", expiry: "May 04, 2025", officer: "Chanda Mwanza", status: "Under Review" },
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
        title={`Sanction ${row.id}`}
        badge={<Badge tone={STATUS_TONE[row.status]} dot>{row.status}</Badge>}
      />

      <Section title="Institution Summary">
        <div className="mb-2 flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Icon name="bank" className="h-[18px] w-[18px]" />
          </span>
          <span className="text-[13px] font-semibold text-slate-800">{row.institution}</span>
        </div>
        <KVRow label="Institution Type" value="Private University" />
        <KVRow label="Province" value="Lusaka" />
        <KVRow label="Risk Level" value={<span className="font-bold text-red-600">High</span>} />
      </Section>

      <Section title="Sanction Details">
        <KVRow label="Sanction Type" value={<Badge tone={TYPE_TONE[row.type]}>{row.type}</Badge>} />
        <KVRow label="Effective Date" value={row.effective} />
        <KVRow label="Expiry / Review Date" value={row.expiry} />
        <KVRow label="Assigned Officer" value={<AvatarName name={row.officer} />} />
      </Section>

      <Section title="Reason for Sanction">
        <p className="text-[12.5px] leading-relaxed text-slate-600">
          {row.reason} as per ZAQA Standards and Guidelines for Higher Education.
        </p>
      </Section>

      <Section title="Legal Basis">
        <div className="space-y-1 text-[12.5px] text-slate-600">
          <div>ZAQA Act No. 4 of 2011 – Section 28(1)(b)</div>
          <div>HE Standards &amp; Guidelines – Standard 3.2.1</div>
        </div>
      </Section>

      <Section title="Evidence Attachments (2)">
        <div className="space-y-2">
          <FileRow name="Inspection_Report_May2_2025.pdf" size="1.2 MB" icon="fileText" tone="softred" />
          <FileRow name="Staffing_Analysis_Report.pdf" size="875 KB" icon="fileText" tone="softred" />
        </div>
      </Section>

      <Section title="Notice History">
        <Timeline
          items={[
            { title: "Formal Warning Letter issued", sub: <span className="flex items-center gap-2">by Grace Banda <Badge tone="green">Delivered</Badge></span>, time: "May 02, 2025", state: "done" },
            { title: "Inspection Notice issued", sub: <span className="flex items-center gap-2">by HEA <Badge tone="green">Delivered</Badge></span>, time: "May 07, 2025", state: "done" },
            { title: "Suspension Notice issued", sub: <span className="flex items-center gap-2">by HEA <Badge tone="green">Delivered</Badge></span>, time: "May 14, 2025", state: "error" },
          ]}
        />
      </Section>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-1.5 text-[12px] font-bold text-slate-800">Compliance Deadlines</div>
          <KVRow label="Response Due" value={<span className="text-red-600">May 18, 2025</span>} />
          <KVRow label="Corrective Actions Due" value={<span className="text-red-600">May 19, 2025</span>} />
          <KVRow label="Hearing (if any)" value="May 21, 2025" />
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-1.5 text-[12px] font-bold text-slate-800">Review Timeline</div>
          <KVRow label="Initial Review" value="May 20, 2025" />
          <KVRow label="Re-evaluation" value="May 27, 2025" />
          <KVRow label="Final Decision" value="Jun 03, 2025" />
        </div>
      </div>

      <div>
        <div className="mb-2 text-[12px] font-bold text-slate-800">Actions</div>
        <div className="grid grid-cols-2 gap-2">
          <ActionBtn tone="softblue" icon="bell" full>Issue Warning</ActionBtn>
          <ActionBtn tone="softred" icon="x" full>Suspend Accreditation</ActionBtn>
          <ActionBtn tone="softorange" full>Apply Restriction</ActionBtn>
          <ActionBtn tone="softpurple" icon="calendar" full>Extend Deadline</ActionBtn>
          <ActionBtn tone="softgreen" icon="check" full>Lift Sanction</ActionBtn>
          <ActionBtn tone="outline" full>Close Action</ActionBtn>
        </div>
      </div>
    </div>
  );
}

export default function HeaEnforcementPage() {
  const { ready, user } = usePortalGuard(["hea"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(SANCTIONS[0].id);
  if (!ready) return null;
  const rows = SANCTIONS.filter(
    (r) => !q || (r.institution + r.id + r.officer + r.reason).toLowerCase().includes(q.toLowerCase())
  );
  const selected = SANCTIONS.find((r) => r.id === sel) || SANCTIONS[0];

  return (
    <PortalShell
      portal="hea"
      active="enforcement"
      title={
        <span className="flex items-center gap-2.5">
          HEA Portal – Enforcement &amp; Sanctions
          <Badge tone="slate">Sample data</Badge>
        </span>
      }
      user={{ name: user.name || user.email, sub: user.email }}
      subtitle="Manage warning notices, suspension actions, compliance orders, and sanction tracking."
      actions={
        <>
          <ActionBtn tone="navy" icon="plus">New Enforcement Action</ActionBtn>
          <SelectPill label="May 14 – May 20, 2025" />
        </>
      }
      panel={<DetailPanel row={selected} />}
      panelWidth="w-[400px]"
    >
      <StatRow cols={5}>
        <StatCard icon="shield" iconTone="softred" label="Active Sanctions" value="24" delta="7.7%" deltaUp={false} deltaText="vs last 7 days" />
        <StatCard icon="bell" iconTone="amber" label="Warning Notices" value="38" delta="18.8%" deltaUp deltaText="vs last 7 days" />
        <StatCard icon="eye" iconTone="softblue" label="Institutions Under Watch" value="16" delta="6.7%" deltaUp={false} deltaText="vs last 7 days" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Lifted Sanctions" value="12" delta="20.0%" deltaUp deltaText="vs last 7 days" />
        <StatCard icon="gavel" iconTone="purple" label="Pending Enforcement" value="19" delta="13.6%" deltaUp={false} deltaText="vs last 7 days" />
      </StatRow>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-80" placeholder="Search institutions, sanction ID, officer, or reason..." value={q} onChange={setQ} />
          <SelectPill label="All Sanction Types" />
          <SelectPill label="All Statuses" />
          <SelectPill label="All Risk Levels" />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
          <ToolButton icon="refresh" />
        </div>
        <DataTable
          rowKey="id"
          activeKey={sel}
          onRowClick={(r) => setSel(r.id)}
          columns={[
            {
              key: "institution", label: "Institution",
              render: (r) => (
                <span className="flex items-center gap-2">
                  <Avatar name={r.institution} size="h-7 w-7" />
                  <span className="font-medium text-slate-700">{r.institution}</span>
                </span>
              ),
            },
            { key: "id", label: "Sanction ID", render: (r) => <span className="font-semibold text-blue-600">{r.id}</span> },
            { key: "type", label: "Sanction Type", render: (r) => <Badge tone={TYPE_TONE[r.type]}>{r.type}</Badge> },
            { key: "reason", label: "Reason" },
            { key: "effective", label: "Effective Date" },
            { key: "expiry", label: "Expiry / Review Date" },
            { key: "officer", label: "Assigned Officer", render: (r) => <AvatarName name={r.officer} /> },
            { key: "status", label: "Status", render: (r) => <Badge tone={STATUS_TONE[r.status]} dot>{r.status}</Badge> },
            { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
          ]}
          rows={rows}
        />
        <div className="flex items-center gap-2 pr-3.5">
          <Pagination className="flex-1" summary="Showing 1 to 10 of 24 records" page={1} pages={3} />
          <SelectPill label="10 / page" />
        </div>
      </div>
    </PortalShell>
  );
}
