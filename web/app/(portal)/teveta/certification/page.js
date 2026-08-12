"use client";

import { useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, Avatar, StatCard, StatRow, TabBar, SearchBox, SelectPill, ToolButton,
  DataTable, Pagination, KVGrid, Timeline, CheckItem, ActionBtn,
} from "../../../../components/portal/kit";
import { usePortalGuard } from "../../../../components/portal/auth";

const RECORDS = [
  { cert: "ZMB-TEV-2025-0008562", candidate: "Emmanuel Bwalya", qualification: "Craft Certificate (Level 3)", provider: "Kitwe TTC", trade: "Electrical Installation", issued: "May 14, 2025", status: "Issued", qr: "Ready" },
  { cert: "ZMB-TEV-2025-0008561", candidate: "Phiri, Margaret", qualification: "Craft Certificate (Level 3)", provider: "Ndola TTC", trade: "Hospitality (Food & Beverage)", issued: "May 13, 2025", status: "Issued", qr: "Ready" },
  { cert: "ZMB-TEV-2025-0008560", candidate: "Tembo, Peter", qualification: "Craft Certificate (Level 4)", provider: "Lusaka TTC", trade: "Automotive Mechanics", issued: "May 12, 2025", status: "Issued", qr: "Ready" },
  { cert: "ZMB-TEV-2025-0008559", candidate: "Nkomo, Sydney", qualification: "Craft Certificate (Level 3)", provider: "Mufulira TTC", trade: "Plumbing", issued: "May 11, 2025", status: "Pending", qr: "In Progress" },
  { cert: "ZMB-TEV-2025-0008558", candidate: "Kabwe, Patricia", qualification: "National Certificate (Level 4)", provider: "Chipata TTC", trade: "ICT Support", issued: "May 10, 2025", status: "Issued", qr: "Ready" },
  { cert: "ZMB-TEV-2025-0008557", candidate: "Chisanga, Brian", qualification: "Craft Certificate (Level 3)", provider: "Solwezi TTC", trade: "Welding", issued: "May 9, 2025", status: "Issued", qr: "Ready" },
  { cert: "ZMB-TEV-2025-0008556", candidate: "Sakala, Mary", qualification: "Craft Certificate (Level 3)", provider: "Kitwe TTC", trade: "Electrical Installation", issued: "May 8, 2025", status: "Pending", qr: "In Progress" },
  { cert: "ZMB-TEV-2025-0008555", candidate: "Mwale, David", qualification: "Craft Certificate (Level 4)", provider: "Ndola TTC", trade: "Automotive Mechanics", issued: "May 7, 2025", status: "Issued", qr: "Ready" },
  { cert: "ZMB-TEV-2025-0008554", candidate: "Lungu, Christine", qualification: "Craft Certificate (Level 3)", provider: "Mufulira TTC", trade: "Hospitality (Housekeeping)", issued: "May 6, 2025", status: "Pending", qr: "In Progress" },
  { cert: "ZMB-TEV-2025-0008553", candidate: "Mbewe, Victor", qualification: "National Certificate (Level 4)", provider: "Chipata TTC", trade: "ICT Support", issued: "May 5, 2025", status: "Issued", qr: "Ready" },
];

const STATUS_TONES = { Issued: "green", Pending: "amber" };

function displayName(candidate) {
  return candidate.includes(",")
    ? candidate.split(",").map((s) => s.trim()).reverse().join(" ")
    : candidate;
}

function PanelCard({ title, chip, children, className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-200 p-3.5 ${className}`}>
      {title && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-semibold text-slate-800">{title}</span>
          {chip}
        </div>
      )}
      {children}
    </div>
  );
}

function DetailPanel({ rec, tab, setTab }) {
  const name = displayName(rec.candidate);
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">Certificate Details</h2>
          <div className="mt-0.5 text-[12px] font-semibold text-slate-500">{rec.cert}</div>
        </div>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <PanelCard title="Candidate Profile" className="mb-3">
        <div className="flex items-start gap-3">
          <Avatar name={name} size="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-bold text-slate-900">{name}</span>
              <Badge tone="green" dot>Record Active</Badge>
            </div>
            <div className="mt-1.5 space-y-1 text-[12px] text-slate-500">
              <div className="flex items-center gap-1.5"><Icon name="user" className="h-3.5 w-3.5 text-slate-400" /> NRC: 123456/45/1</div>
              <div className="flex items-center gap-1.5"><Icon name="send" className="h-3.5 w-3.5 text-slate-400" /> +260 97 1234567</div>
              <div className="flex items-center gap-1.5"><Icon name="inbox" className="h-3.5 w-3.5 text-slate-400" /> emmanuel.bwalya@email.com</div>
              <div className="flex items-center gap-1.5"><Icon name="map" className="h-3.5 w-3.5 text-slate-400" /> Kitwe, Copperbelt Province</div>
            </div>
          </div>
        </div>
      </PanelCard>

      <PanelCard title="Qualification Summary" className="mb-3">
        <KVGrid
          cols={2}
          items={[
            { label: "Qualification", value: rec.qualification },
            { label: "Accreditation No.", value: "ACC/TEV/2023/045" },
            { label: "Trade Area", value: rec.trade },
            { label: "Completion Date", value: "May 12, 2025" },
            { label: "Provider", value: rec.provider },
          ]}
        />
      </PanelCard>

      <PanelCard title="Assessment Result Summary" className="mb-3">
        <KVGrid
          cols={2}
          items={[
            { label: "Overall Result", value: <Badge tone="green">Pass</Badge> },
            { label: "Total Marks", value: "82%" },
            { label: "Assessment Date", value: "May 12, 2025" },
            { label: "Assessment Type", value: "Practical & Theory" },
          ]}
        />
        <button className="mt-2 text-[11px] font-semibold text-blue-600">View Assessment Details</button>
      </PanelCard>

      <PanelCard title="Issuance, Replacement & Verification" className="mb-3">
        <div className="mb-3">
          <TabBar
            tabs={["Issuance History", "Replacement History", "Verification Status"]}
            active={tab}
            onChange={setTab}
            accent="border-orange-500 text-orange-600"
          />
        </div>
        <Timeline
          items={[
            { title: "Certificate Issued", sub: "Chanda Mwila (BBACVS Officer)", time: "May 14, 2025 10:32 AM", state: "done" },
            { title: "Record Approved", sub: "Grace Mulenga (QA Manager)", time: "May 13, 2025 02:15 PM", state: "done" },
            { title: "Assessment Completed", sub: "Assessor: Henry Zulu", time: "May 12, 2025 11:05 AM", state: "done" },
          ]}
        />
      </PanelCard>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <PanelCard title="Certificate Preview">
          <div className="mb-2 flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
            <Icon name="qr" className="h-8 w-8 text-slate-400" />
          </div>
          <button className="text-[11px] font-semibold text-blue-600">Download Certificate (PDF)</button>
        </PanelCard>
        <PanelCard title="Verification Readiness">
          <CheckItem state="ok" label="QR Code Generated" />
          <CheckItem state="ok" label="Record Complete" />
          <CheckItem state="ok" label="Assessments Verified" />
          <CheckItem state="ok" label="Ready for Verification" />
        </PanelCard>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <ActionBtn tone="green" icon="check" full>Issue Certificate</ActionBtn>
        <ActionBtn tone="blue" icon="print" full>Reprint Certificate</ActionBtn>
        <ActionBtn tone="orange" icon="refresh" full>Request Replacement</ActionBtn>
        <ActionBtn tone="softorange" icon="pause" full>Suspend Record</ActionBtn>
        <ActionBtn tone="outline" full className="col-span-2">View Verification Log</ActionBtn>
      </div>
    </div>
  );
}

export default function TevetaCertificationPage() {
  const { ready, user } = usePortalGuard(["teveta"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(RECORDS[0].cert);
  const [panelTab, setPanelTab] = useState("Issuance History");
  const rows = RECORDS.filter(
    (r) => !q || (r.cert + r.candidate + r.qualification + r.provider + r.trade).toLowerCase().includes(q.toLowerCase())
  );
  const selected = RECORDS.find((r) => r.cert === sel) || RECORDS[0];

  if (!ready) return null;

  return (
    <PortalShell
      portal="teveta"
      active="certification"
      user={{ name: user.name || user.email, sub: user.email }}
      title={
        <span className="flex items-center gap-2">
          TEVETA Portal – Certification Records
          <Badge tone="slate">Sample data</Badge>
        </span>
      }
      subtitle="Manage trainee certification records, issuance history, replacements, and verification readiness."
      actions={
        <>
          <ActionBtn tone="navy" icon="plus">
            New Certificate Record <Icon name="chevronDown" className="h-3.5 w-3.5" />
          </ActionBtn>
          <ActionBtn tone="outline" icon="download">Export Records</ActionBtn>
        </>
      }
      panel={<DetailPanel rec={selected} tab={panelTab} setTab={setPanelTab} />}
      panelWidth="w-[400px]"
    >
      <StatRow cols={5}>
        <StatCard icon="file" iconTone="softgreen" label="Certificates Issued" value="8,562" delta="11.4%" deltaUp deltaText="vs last 30 days" />
        <StatCard icon="clock" iconTone="amber" label="Pending Issuance" value="236" delta="8.7%" deltaUp deltaText="vs last 30 days" />
        <StatCard icon="refresh" iconTone="softblue" label="Replacements Requested" value="78" delta="5.2%" deltaUp={false} deltaText="vs last 30 days" />
        <StatCard icon="revoke" iconTone="softred" label="Revoked Records" value="24" delta="2.1%" deltaUp deltaText="vs last 30 days" />
        <StatCard icon="shieldCheck" iconTone="purple" label="Verifications Completed" value="1,354" delta="16.8%" deltaUp deltaText="vs last 30 days" />
      </StatRow>

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-4 shadow-card">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox
            className="w-80"
            placeholder="Search by candidate name, certificate number, qualification..."
            value={q}
            onChange={setQ}
          />
          <SelectPill label="All Qualifications" />
          <SelectPill label="All Providers" />
          <SelectPill label="All Statuses" />
          <SelectPill label="All Trade Areas" />
          <ToolButton icon="filter">Filter</ToolButton>
        </div>
        <DataTable
          rowKey="cert"
          activeKey={sel}
          onRowClick={(r) => setSel(r.cert)}
          columns={[
            { key: "cert", label: "Certificate Number", render: (r) => <span className="font-semibold text-slate-800">{r.cert}</span> },
            { key: "candidate", label: "Candidate" },
            { key: "qualification", label: "Qualification" },
            { key: "provider", label: "Provider" },
            { key: "trade", label: "Trade Area" },
            { key: "issued", label: "Issue Date" },
            { key: "status", label: "Status", render: (r) => <Badge tone={STATUS_TONES[r.status]}>{r.status}</Badge> },
            {
              key: "qr",
              label: "QR Readiness",
              render: (r) =>
                r.qr === "Ready" ? (
                  <Badge tone="green" icon="check">Ready</Badge>
                ) : (
                  <Badge tone="amber" icon="clock">In Progress</Badge>
                ),
            },
            {
              key: "actions",
              label: "Actions",
              render: () => (
                <span className="flex items-center gap-2">
                  <Icon name="eye" className="h-4 w-4 text-slate-400" />
                  <Icon name="dots" className="h-4 w-4 text-slate-400" />
                </span>
              ),
            },
          ]}
          rows={rows}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Pagination summary="Showing 1 to 10 of 8,562 records" page={1} pages={857} className="flex-1" />
          <SelectPill label="10 / page" className="!py-1.5" />
        </div>
      </div>
    </PortalShell>
  );
}
