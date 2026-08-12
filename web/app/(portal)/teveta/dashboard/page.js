"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, Avatar, AvatarName, StatCard, StatRow, SearchBox, SelectPill, ToolButton,
  DataTable, Pagination, ProgressBar, WorkflowSteps, ActionBtn, SectionCard,
} from "../../../../components/portal/kit";
import { api, openBlob } from "../../../../lib/api";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";

const APPS = [
  { id: "RPL-2025-0142", candidate: "Bwalya, Emmanuel", trade: "Electrical Installation", qualification: "Craft Certificate (Level 3)", assessor: "Chanda Mwila", evidence: "Complete", decision: "Under Review", submitted: "May 20, 2025" },
  { id: "RPL-2025-0141", candidate: "Phiri, Margaret", trade: "Hospitality (Food & Beverage)", qualification: "Craft Certificate (Level 3)", assessor: "Grace Mulenga", evidence: "Complete", decision: "Pending Decision", submitted: "May 20, 2025" },
  { id: "RPL-2025-0140", candidate: "Tembo, Peter", trade: "Automotive Mechanics", qualification: "Craft Certificate (Level 4)", assessor: "Henry Zulu", evidence: "Complete", decision: "Under Review", submitted: "May 19, 2025" },
  { id: "RPL-2025-0139", candidate: "Nkomo, Sydney", trade: "Plumbing", qualification: "Craft Certificate (Level 3)", assessor: "Sichillima Banda", evidence: "Partial", decision: "More Evidence", submitted: "May 19, 2025" },
  { id: "RPL-2025-0138", candidate: "Kabwe, Patricia", trade: "ICT Support", qualification: "National Certificate (Level 4)", assessor: "Mutinta Kapwepwe", evidence: "Partial", decision: "More Evidence", submitted: "May 18, 2025" },
  { id: "RPL-2025-0137", candidate: "Chisanga, Brian", trade: "Welding", qualification: "Craft Certificate (Level 3)", assessor: "Daniel Chilufya", evidence: "Complete", decision: "Approved", submitted: "May 18, 2025" },
  { id: "RPL-2025-0136", candidate: "Sakala, Mary", trade: "Electrical Installation", qualification: "Craft Certificate (Level 3)", assessor: "Chanda Mwila", evidence: "Partial", decision: "Pending Decision", submitted: "May 17, 2025" },
  { id: "RPL-2025-0135", candidate: "Mwale, David", trade: "Automotive Mechanics", qualification: "Craft Certificate (Level 4)", assessor: "Henry Zulu", evidence: "Complete", decision: "Under Review", submitted: "May 16, 2025" },
  { id: "RPL-2025-0134", candidate: "Lungu, Christine", trade: "Hospitality (Housekeeping)", qualification: "Craft Certificate (Level 3)", assessor: "Grace Mulenga", evidence: "Partial", decision: "More Evidence", submitted: "May 16, 2025" },
  { id: "RPL-2025-0133", candidate: "Mbewe, Victor", trade: "ICT Support", qualification: "National Certificate (Level 4)", assessor: "Mutinta Kapwepwe", evidence: "Complete", decision: "Approved", submitted: "May 15, 2025" },
];

const EVIDENCE_TONES = { Complete: "green", Partial: "amber" };
const DECISION_TONES = { "Under Review": "amber", "Pending Decision": "amber", "More Evidence": "blue", Approved: "green" };

const EVIDENCE_FILES = [
  { label: "Work Experience", type: "PDF", icon: "fileText", cls: "bg-red-50 text-red-600" },
  { label: "Employment Letter", type: "PDF", icon: "fileText", cls: "bg-red-50 text-red-600" },
  { label: "Trade Photos", type: "JPG", icon: "file", cls: "bg-blue-50 text-blue-600" },
  { label: "Reference Letter", type: "PDF", icon: "fileText", cls: "bg-red-50 text-red-600" },
  { label: "+4 More", type: "", icon: "folder", cls: "border border-slate-200 bg-white text-slate-500" },
];

function displayName(candidate) {
  return candidate.includes(",")
    ? candidate.split(",").map((s) => s.trim()).reverse().join(" ")
    : candidate;
}

function PanelCard({ title, chip, action, children, className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-200 p-3.5 ${className}`}>
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold text-slate-800">{title}</span>
            {chip}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function DetailPanel({ app }) {
  const name = displayName(app.candidate);
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Candidate Profile</h2>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Collapse">
          <Icon name="chevronDown" className="h-[18px] w-[18px] rotate-180" />
        </button>
      </div>

      <div className="mb-4 flex items-start gap-3">
        <Avatar name={name} size="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-bold text-slate-900">{name}</span>
            <Badge tone="orange">{app.id}</Badge>
          </div>
          <div className="mt-1.5 space-y-1 text-[12px] text-slate-500">
            <div className="flex items-center gap-1.5"><Icon name="user" className="h-3.5 w-3.5 text-slate-400" /> NRC: 123456/45/1</div>
            <div className="flex items-center gap-1.5"><Icon name="send" className="h-3.5 w-3.5 text-slate-400" /> +260 97 1234567</div>
            <div className="flex items-center gap-1.5"><Icon name="inbox" className="h-3.5 w-3.5 text-slate-400" /> emmanuel.bwalya@email.com</div>
            <div className="flex items-center gap-1.5"><Icon name="map" className="h-3.5 w-3.5 text-slate-400" /> Kitwe, Copperbelt Province</div>
          </div>
        </div>
      </div>

      <PanelCard
        title="Evidence Portfolio"
        chip={<Badge tone="orange">8</Badge>}
        action={<button className="text-[11px] font-semibold text-blue-600">View All</button>}
        className="mb-3"
      >
        <div className="grid grid-cols-5 gap-2">
          {EVIDENCE_FILES.map((f) => (
            <div key={f.label} className="flex flex-col items-center gap-1 rounded-lg border border-slate-100 p-2 text-center">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${f.cls}`}>
                <Icon name={f.icon} className="h-4 w-4" />
              </span>
              <span className="text-[10px] font-medium leading-tight text-slate-600">{f.label}</span>
              {f.type && <span className="text-[9px] text-slate-400">{f.type}</span>}
            </div>
          ))}
        </div>
      </PanelCard>

      <PanelCard
        title="Mapped Competencies"
        chip={<Badge tone="softgreen">12 / 15</Badge>}
        action={<button className="text-[11px] font-semibold text-blue-600">View Details</button>}
        className="mb-3"
      >
        <ProgressBar value={80} tone="green" className="mb-2" />
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-semibold text-emerald-600">12 Competencies Achieved</span>
          <span className="font-semibold text-amber-600">3 Gaps Identified</span>
        </div>
      </PanelCard>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 p-3.5 text-center">
          <div className="text-[11px] font-medium text-slate-400">Practical Assessment</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">78%</div>
          <div className="mt-1.5"><Badge tone="green">Pass</Badge></div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3.5 text-center">
          <div className="text-[11px] font-medium text-slate-400">Theory Assessment</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">72%</div>
          <div className="mt-1.5"><Badge tone="green">Pass</Badge></div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <PanelCard title="Gap Analysis">
          <ul className="space-y-1.5 text-[12px] text-slate-600">
            <li className="flex gap-1.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> Safety Management (Basic)</li>
            <li className="flex gap-1.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> Electrical Drawings (Interpretation)</li>
            <li className="flex gap-1.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> Fault Finding Techniques (Advanced)</li>
          </ul>
          <button className="mt-2 text-[11px] font-semibold text-blue-600">View Gap Details</button>
        </PanelCard>
        <PanelCard title="Recommended NQF Level">
          <div className="text-xl font-bold text-slate-900">Level 3</div>
          <div className="mt-0.5 text-[12px] text-slate-500">Craft Certificate — Electrical Installation</div>
          <button className="mt-2 text-[11px] font-semibold text-blue-600">View Qualification</button>
        </PanelCard>
      </div>

      <PanelCard title="Assessor Comments" className="mb-3">
        <p className="text-[12px] leading-relaxed text-slate-600">
          Strong practical skills demonstrated. Minor gaps in theoretical knowledge and safety
          documentation. Recommend approval subject to completion of minor gaps.
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-700">— Chanda Mwila (Assessor)</span>
          <span className="text-[11px] text-slate-400">May 20, 2025</span>
        </div>
      </PanelCard>

      <SectionCard title="Workflow Stages" className="mb-4" pad="p-4">
        <WorkflowSteps
          steps={[
            { label: "Submitted", sub: "May 20", state: "done" },
            { label: "Screening", sub: "May 20", state: "done" },
            { label: "Assessment", sub: "In Progress", state: "current" },
            { label: "Decision", sub: "Pending", state: "pending" },
            { label: "Certification", sub: "Pending", state: "pending" },
          ]}
        />
      </SectionCard>

      <div className="grid grid-cols-2 gap-2.5">
        <ActionBtn tone="green" icon="check" full>Approve RPL</ActionBtn>
        <ActionBtn tone="blue" icon="calendar" full>Schedule Trade Test</ActionBtn>
        <ActionBtn tone="softorange" full>Request More Evidence</ActionBtn>
        <ActionBtn tone="red" icon="x" full>Reject</ActionBtn>
      </div>
    </div>
  );
}

export default function TevetaDashboardPage() {
  const { ready, user, token } = usePortalGuard(["teveta"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(APPS[0].id);
  const [pending, setPending] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const loadPending = useCallback(async () => {
    try {
      setPending((await api.tevetaPending(token)).pending || []);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    if (ready) loadPending();
  }, [ready, loadPending]);

  async function approveProvider(id) {
    setBusy(id);
    setError(null);
    try {
      const r = await api.tevetaApprove(token, id);
      if (r.warning) setError(r.warning);
      await loadPending();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function rejectProvider(id) {
    const reason = prompt("Reason for rejection (optional):");
    if (reason === null) return;
    setBusy(id);
    setError(null);
    try {
      await api.tevetaReject(token, id, reason);
      await loadPending();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function viewProviderDoc(id) {
    try {
      openBlob(await api.accreditationDoc(token, "teveta", id));
    } catch (err) {
      setError(err.message);
    }
  }

  const rows = APPS.filter(
    (a) => !q || (a.candidate + a.id + a.trade + a.qualification + a.assessor).toLowerCase().includes(q.toLowerCase())
  );
  const selected = APPS.find((a) => a.id === sel) || APPS[0];

  if (!ready) return null;

  return (
    <PortalShell
      portal="teveta"
      active="dashboard"
      user={{ name: user.name || user.email, sub: user.email }}
      title={
        <span className="flex items-center gap-2">
          TEVETA Portal – RPL, Trade Testing & Skills Assessment
          <Badge tone="slate">Sample data</Badge>
        </span>
      }
      subtitle="Recognition of Prior Learning (RPL), Practical Trade Testing and Skills Assessment Management"
      actions={
        <>
          <ActionBtn tone="navy" icon="plus">New RPL Application</ActionBtn>
          <SelectPill label="May 14 – May 20, 2025" />
        </>
      }
      panel={<DetailPanel app={selected} />}
      panelWidth="w-[400px]"
    >
      <StatRow cols={4}>
        <StatCard icon="fileText" iconTone="softblue" label="RPL Applications" value="142" delta="18.7%" deltaUp deltaText="vs last 7 days" />
        <StatCard icon="calendar" iconTone="orange" label="Trade Tests Scheduled" value="56" delta="12.3%" deltaUp deltaText="vs last 7 days" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Assessments Completed" value="98" delta="21.4%" deltaUp deltaText="vs last 7 days" />
        <StatCard icon="award" iconTone="purple" label="Certificates Issued" value="74" delta="16.2%" deltaUp deltaText="vs last 7 days" />
      </StatRow>

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-4 shadow-card">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox
            className="w-80"
            placeholder="Search by candidate, trade, qualification, assessor..."
            value={q}
            onChange={setQ}
          />
          <SelectPill label="All Trade Areas" />
          <SelectPill label="All Statuses" />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
          <ToolButton icon="refresh" />
        </div>
        <DataTable
          rowKey="id"
          activeKey={sel}
          onRowClick={(r) => setSel(r.id)}
          columns={[
            { key: "id", label: "Application ID", render: (r) => <span className="font-semibold text-blue-600">{r.id}</span> },
            { key: "candidate", label: "Candidate" },
            { key: "trade", label: "Trade Area" },
            { key: "qualification", label: "Proposed Qualification" },
            { key: "assessor", label: "Assessor", render: (r) => <AvatarName name={r.assessor} /> },
            { key: "evidence", label: "Evidence Status", render: (r) => <Badge tone={EVIDENCE_TONES[r.evidence]}>{r.evidence}</Badge> },
            { key: "decision", label: "Decision Status", render: (r) => <Badge tone={DECISION_TONES[r.decision]}>{r.decision}</Badge> },
            { key: "submitted", label: "Date Submitted" },
            { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
          ]}
          rows={rows}
        />
        <Pagination summary="Showing 1 to 10 of 142 applications" page={1} pages={15} />
      </div>

      <SectionCard
        title="Pending provider registrations"
        className="mt-5"
        action={<Badge tone="amber">{pending.length} awaiting review</Badge>}
      >
        {error && <div className="mb-2 text-[12px] font-medium text-red-600">{error}</div>}
        <DataTable
          rowKey="id"
          columns={[
            { key: "institution", label: "Institution", render: (r) => <span className="font-semibold text-slate-800">{r.institution}</span> },
            {
              key: "origin",
              label: "Origin",
              render: (r) => (
                <Badge tone={r.selfRegistered ? "blue" : "slate"}>
                  {r.selfRegistered ? "Self-registered" : "TEVETA-registered"}
                </Badge>
              ),
            },
            { key: "createdAt", label: "Submitted", render: (r) => fmtDate(r.createdAt) },
            { key: "status", label: "Status", render: () => <Badge tone="amber" dot>Pending</Badge> },
            {
              key: "actions",
              label: "Actions",
              render: (r) => (
                <span className="flex items-center gap-2">
                  {r.hasAccreditationDoc && (
                    <ActionBtn tone="outline" icon="fileText" className="!px-2.5 !py-1 text-[12px]" onClick={() => viewProviderDoc(r.id)}>
                      Doc
                    </ActionBtn>
                  )}
                  <ActionBtn
                    tone="green"
                    icon="check"
                    className="!px-2.5 !py-1 text-[12px] disabled:opacity-50"
                    disabled={busy === r.id}
                    onClick={() => approveProvider(r.id)}
                  >
                    {busy === r.id ? "Approving…" : "Approve"}
                  </ActionBtn>
                  <ActionBtn
                    tone="red"
                    icon="x"
                    className="!px-2.5 !py-1 text-[12px] disabled:opacity-50"
                    disabled={busy === r.id}
                    onClick={() => rejectProvider(r.id)}
                  >
                    Reject
                  </ActionBtn>
                </span>
              ),
            },
          ]}
          rows={pending}
          footer={
            pending.length === 0 && (
              <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
            )
          }
        />
      </SectionCard>
    </PortalShell>
  );
}
