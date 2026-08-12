"use client";

import { useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, AvatarName, StatCard, StatRow, SectionCard, SelectPill, SearchBox,
  ToolButton, DataTable, Pagination, ProgressBar, CheckItem, KVRow, FileRow,
  ActionBtn, TONES,
} from "../../../../components/portal/kit";
import { usePortalGuard } from "../../../../components/portal/auth";

const KPIS = [
  { icon: "folder", iconTone: "softblue", label: "Evidence Packages Ready", value: "18", delta: "20.0%", deltaUp: true },
  { icon: "clock", iconTone: "amber", label: "Pending ZAQA Requests", value: "11", delta: "10.0%", deltaUp: true },
  { icon: "send", iconTone: "softblue", label: "Sent to ZAQA This Month", value: "22", delta: "15.8%", deltaUp: true },
  { icon: "help", iconTone: "softred", label: "Returned for Clarification", value: "6", delta: "14.3%", deltaUp: false },
  { icon: "checkCircle", iconTone: "softgreen", label: "Completed Validations", value: "29", delta: "16.0%", deltaUp: true },
];

const STATUS_TONE = {
  "Sent to ZAQA": "blue",
  "Pending ZAQA Request": "amber",
  "Under Review": "amber",
  "Returned for Clarification": "red",
  Completed: "green",
  Draft: "slate",
};

const PACKAGES = [
  { id: "EVP-2025-0054", institution: "Copperbelt University", programme: "BSc in Computer Science", type: "Programme Accreditation", completeness: 96, updated: "May 19, 2025", status: "Sent to ZAQA", officer: "Grace Banda" },
  { id: "EVP-2025-0053", institution: "Mulungushi University", programme: "BEd in Secondary Education", type: "Programme Accreditation", completeness: 88, updated: "May 16, 2025", status: "Pending ZAQA Request", officer: "Chanda Mwanza" },
  { id: "EVP-2025-0052", institution: "Cavendish University Zambia", programme: "LLB (Bachelor of Laws)", type: "Programme Accreditation", completeness: 100, updated: "May 15, 2025", status: "Under Review", officer: "Evelyn Phiri" },
  { id: "EVP-2025-0051", institution: "Evelyn Hone College", programme: "Diploma in Accounting", type: "Institutional Accreditation", completeness: 74, updated: "May 12, 2025", status: "Returned for Clarification", officer: "Margaret Simuk" },
  { id: "EVP-2025-0050", institution: "African Leadership University", programme: "MBA in Leadership", type: "Programme Accreditation", completeness: 92, updated: "May 10, 2025", status: "Sent to ZAQA", officer: "Brian Phiri" },
  { id: "EVP-2025-0049", institution: "ZCAS University", programme: "BSc in Nursing", type: "Programme Accreditation", completeness: 81, updated: "May 08, 2025", status: "Pending ZAQA Request", officer: "Brian Phiri" },
  { id: "EVP-2025-0048", institution: "University of Zambia", programme: "BA in Economics", type: "Programme Accreditation", completeness: 100, updated: "May 07, 2025", status: "Completed", officer: "Grace Banda" },
  { id: "EVP-2025-0047", institution: "Levy Mwanawasa Medical University", programme: "MBChB (Medicine)", type: "Programme Accreditation", completeness: 97, updated: "May 05, 2025", status: "Completed", officer: "Tandiwe Mbewe" },
  { id: "EVP-2025-0046", institution: "Nkumba University", programme: "BSc in Information Systems", type: "Programme Accreditation", completeness: 67, updated: "May 02, 2025", status: "Draft", officer: "Emphy Phiri" },
  { id: "EVP-2025-0045", institution: "Grace Bible College", programme: "Diploma in Theology", type: "Programme Accreditation", completeness: 55, updated: "Apr 30, 2025", status: "Draft", officer: "Mulenga Chileshe" },
];

const completenessTone = (v) => (v >= 80 ? "green" : v >= 60 ? "orange" : "red");

const DOCS = [
  { name: "Self-Study Report.pdf", size: "4.8 MB" },
  { name: "Curriculum & Syllabi.docx", size: "2.1 MB" },
  { name: "Staff Qualifications.pdf", size: "1.7 MB" },
  { name: "Student Performance Data.xlsx", size: "980 KB", tone: "softgreen" },
  { name: "Facility Inspection Report.pdf", size: "3.2 MB" },
  { name: "Quality Assurance Manual.pdf", size: "1.3 MB" },
];

const CHECKLIST = [
  "Programme Information",
  "Governance & Leadership",
  "Curriculum & Learning",
  "Teaching & Learning Resources",
  "Student Support & Services",
  "Quality Assurance",
  "Facilities & Infrastructure",
];

function DetailPanel({ pkg }) {
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Evidence Package Details</h2>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="mb-1 flex items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONES.softblue}`}>
          <Icon name="folder" className="h-[18px] w-[18px]" />
        </span>
        <span className="text-[15px] font-bold text-slate-900">{pkg.id}</span>
        <Badge tone={STATUS_TONE[pkg.status] || "slate"}>{pkg.status}</Badge>
        <Icon name="dots" className="ml-auto h-4 w-4 text-slate-400" />
      </div>
      <div className="mb-4 text-[12px] text-slate-500">
        {pkg.type} Package — Sent: {pkg.updated} · By: {pkg.officer}
      </div>

      <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3.5">
        <AvatarName name={pkg.institution} sub="Copperbelt Province" />
        <div className="text-right leading-tight">
          <div className="text-[11px] text-slate-400">Programme</div>
          <div className="text-[12.5px] font-semibold text-slate-800">{pkg.programme}</div>
          <div className="text-[11px] text-slate-500">Level: Bachelor&apos;s Degree</div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3 rounded-xl border border-slate-200 p-3.5">
        <div>
          <div className="text-[11px] font-medium text-slate-400">Accreditation Status</div>
          <div className="mt-1"><Badge tone="amber">Under Review</Badge></div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-400">HEA Application Ref.</div>
          <div className="mt-0.5 text-[12.5px] font-semibold text-slate-800">HEA/PA/2025/021</div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-slate-400">ZAQA Ref. (if any)</div>
          <div className="mt-0.5 text-[12.5px] font-semibold text-slate-800">ZAQA/2025/1482</div>
        </div>
      </div>

      <SectionCard title="Attached Documents (6)" className="mb-4" pad="p-3">
        <div className="space-y-2">
          {DOCS.map((d) => (
            <FileRow key={d.name} name={d.name} size={d.size} verified tone={d.tone || "softred"} />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Validation Checklist"
        action={<span className="text-[11px] font-semibold text-emerald-600">7 of 7 completed</span>}
        className="mb-4"
        pad="p-3"
      >
        {CHECKLIST.map((c) => (
          <CheckItem key={c} label={c} />
        ))}
      </SectionCard>

      <SectionCard title="Provenance Summary" className="mb-4" pad="p-3.5">
        <KVRow label="Collected By" value="Institution (Copperbelt University)" />
        <KVRow label="Collected On" value="Apr 20 – May 18, 2025" />
        <KVRow label="Verified By" value="HEA Officer (Grace Banda)" />
        <KVRow label="Verified On" value="May 19, 2025" />
        <KVRow label="Version" value="1.0" />
      </SectionCard>

      <SectionCard title="Digital Signature" action={<Badge tone="green">Valid</Badge>} className="mb-4" pad="p-3.5">
        <div className="text-[12.5px] font-semibold text-slate-800">Signed by: Grace Banda</div>
        <div className="mt-0.5 text-[12px] text-slate-500">May 19, 2025 · 10:14 AM</div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-slate-600">
          Certificate: HEA Officer Certificate
          <Icon name="checkCircle" className="h-3.5 w-3.5 text-emerald-500" />
        </div>
        <button className="mt-2 text-[11px] font-semibold text-blue-600 hover:underline">View provenance trail →</button>
      </SectionCard>

      <SectionCard title="Secure Sharing" action={<Badge tone="green">Active</Badge>} className="mb-4" pad="p-3.5">
        <KVRow label="Shared with" value="ZAQA" />
        <KVRow label="Sent on" value="May 19, 2025 · 10:15 AM" />
        <KVRow label="Access Expires" value="Jun 18, 2025 (30 days)" />
      </SectionCard>

      <SectionCard
        title="Communication Log with ZAQA"
        action={<button className="text-[11px] font-semibold text-blue-600 hover:underline">View all</button>}
        className="mb-4"
        pad="p-3.5"
      >
        <div className="space-y-3">
          {[
            { icon: "send", cls: "bg-blue-100 text-blue-600", title: "Package Sent", time: "May 19, 2025 · 10:15 AM", body: "Sent to ZAQA for validation." },
            { icon: "help", cls: "bg-amber-100 text-amber-600", title: "Acknowledged by ZAQA", time: "May 19, 2025", body: "ZAQA acknowledged receipt of the package." },
          ].map((e) => (
            <div key={e.title} className="flex gap-2.5">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${e.cls}`}>
                <Icon name={e.icon} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 leading-tight">
                <div className="text-[12.5px] font-semibold text-slate-800">{e.title}</div>
                <div className="text-[11px] text-slate-400">{e.time}</div>
                <div className="mt-0.5 text-[12px] text-slate-600">{e.body}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-2.5">
        <ActionBtn tone="softblue" full>Compile Package</ActionBtn>
        <ActionBtn tone="navy" icon="send" full>Send to ZAQA</ActionBtn>
        <ActionBtn tone="softorange" full>Request More Evidence</ActionBtn>
        <ActionBtn tone="outline" icon="download" full>Download Summary</ActionBtn>
        <ActionBtn tone="softgreen" icon="check" full>Mark Complete</ActionBtn>
      </div>
    </div>
  );
}

export default function HeaEvidencePage() {
  const { ready, user } = usePortalGuard(["hea"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(PACKAGES[0].id);
  if (!ready) return null;
  const rows = PACKAGES.filter(
    (r) => !q || (r.id + r.institution + r.programme + r.officer).toLowerCase().includes(q.toLowerCase())
  );
  const selected = PACKAGES.find((r) => r.id === sel) || PACKAGES[0];

  return (
    <PortalShell
      portal="hea"
      active="evidence"
      title={
        <span className="flex items-center gap-2.5">
          HEA Portal – Evidence for ZAQA Validation
          <Badge tone="slate">Sample data</Badge>
        </span>
      }
      user={{ name: user.name || user.email, sub: user.email }}
      subtitle="Package and share verified institutional and programme evidence with ZAQA to support validation, accreditation and compliance decisions."
      actions={<ActionBtn tone="navy" icon="plus">New Evidence Package</ActionBtn>}
      panel={<DetailPanel pkg={selected} />}
      panelWidth="w-[420px]"
    >
      <StatRow cols={5}>
        {KPIS.map((k) => (
          <StatCard key={k.label} {...k} deltaText="vs last 30 days" />
        ))}
      </StatRow>

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-4 shadow-card">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-64" placeholder="Search evidence packages..." value={q} onChange={setQ} />
          <SelectPill label="Status: All" />
          <SelectPill label="Institution: All" />
          <SelectPill label="Evidence Type: All" />
          <SelectPill label="ZAQA Status: All" />
          <ToolButton icon="filter">Filters</ToolButton>
          <ToolButton icon="refresh" className="ml-auto" />
        </div>
        <DataTable
          rowKey="id"
          activeKey={sel}
          onRowClick={(r) => setSel(r.id)}
          columns={[
            { key: "id", label: "Package ID", render: (r) => <span className="font-semibold text-blue-600">{r.id}</span> },
            { key: "institution", label: "Institution" },
            { key: "programme", label: "Programme / Qualification" },
            { key: "type", label: "Evidence Type" },
            {
              key: "completeness",
              label: "Completeness",
              render: (r) => (
                <span className="flex min-w-[110px] items-center gap-2">
                  <ProgressBar value={r.completeness} tone={completenessTone(r.completeness)} className="flex-1" />
                  <span className="shrink-0 text-[12px] font-semibold text-slate-700">{r.completeness}%</span>
                </span>
              ),
            },
            { key: "updated", label: "Last Updated" },
            { key: "status", label: "ZAQA Request Status", render: (r) => <Badge tone={STATUS_TONE[r.status] || "slate"}>{r.status}</Badge> },
            { key: "officer", label: "Assigned Officer", render: (r) => <AvatarName name={r.officer} /> },
            {
              key: "action",
              label: "Action",
              render: () => (
                <span className="flex items-center gap-2">
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View
                  </button>
                  <Icon name="dots" className="h-4 w-4 text-slate-400" />
                </span>
              ),
            },
          ]}
          rows={rows}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Pagination summary="Showing 1 to 10 of 18 results" page={1} pages={2} className="flex-1 px-0" />
          <SelectPill label="10 / page" />
        </div>
      </div>
    </PortalShell>
  );
}
