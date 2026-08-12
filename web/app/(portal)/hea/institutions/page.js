"use client";

import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, Avatar, StatCard, StatRow, StatusTabs, SectionCard,
  SelectPill, SearchBox, ToolButton, DataTable, Pagination, Timeline,
  CheckItem, KV, ActionBtn,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api, openBlob } from "../../../../lib/api";

const STATUS_LABEL = { pending: "Under Review", approved: "Approved", suspended: "Suspended" };
const STATUS_TONE = { pending: "amber", approved: "green", suspended: "red" };
const SECTOR_LABEL = { higher_ed: "Higher Education", university: "University", college: "College" };

// Static design chrome — required-document checklist has no backend counterpart.
const CHECKLIST = [
  { state: "ok", label: "Certificate of Incorporation / Establishment" },
  { state: "ok", label: "Constitution / Governance Documents" },
  { state: "ok", label: "Strategic Plan (2025–2029)" },
  { state: "ok", label: "Financial Projections (3 Years)" },
  { state: "ok", label: "Campus Master Plan & Infrastructure Details" },
  { state: "ok", label: "Academic Programmes Overview" },
  { state: "missing", label: "Evidence of Land Tenure" },
  { state: "warn", label: "Audited Financial Statements (Last 2 Years)" },
  { state: "warn", label: "Staffing Plan & Organisational Structure" },
  { state: "missing", label: "Library & E-Learning Resources Plan" },
];

const short = (v) => (v && v.length > 22 ? `${v.slice(0, 12)}…${v.slice(-6)}` : v || "—");

function DetailPanel({ inst, busy, onApprove, onReject, onReturn, onViewDoc }) {
  const status = inst.heaStatus || "approved";
  const timeline = [
    {
      title: "Application Submitted",
      sub: inst.selfRegistered ? "Self-registered by the institution" : "Registered by HEA",
      time: fmtDate(inst.createdAt),
      state: "done",
    },
    { title: "Under Review", sub: status === "pending" ? "Awaiting HEA decision" : "Review completed", state: status === "pending" ? "warn" : "done" },
    {
      title: "Decision",
      sub: status === "pending" ? "Pending" : STATUS_LABEL[status],
      state: status === "pending" ? "pending" : status === "approved" ? "done" : "error",
    },
    {
      title: "On-chain Authorisation",
      sub: inst.onChain ? "Authorised on-chain" : "Not yet anchored",
      state: inst.onChain ? "done" : "pending",
    },
  ];
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Institution Details</h2>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="mb-4 flex items-start gap-3">
        <Avatar name={inst.institution} size="h-11 w-11" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-bold text-slate-900">{inst.institution}</span>
            <Badge tone={STATUS_TONE[status] || "slate"}>{STATUS_LABEL[status] || status}</Badge>
          </div>
          <div className="mt-0.5 text-[12px] text-slate-500">{SECTOR_LABEL[inst.sector] || inst.sector || "Higher Education"}</div>
          <div className="text-[12px] text-slate-500">{inst.selfRegistered ? "Self-registered" : "Registered by HEA"}</div>
        </div>
      </div>

      <div className="mb-4 space-y-3 rounded-xl border border-slate-200 p-3.5">
        <KV label="DID" value={<span className="break-all font-mono text-[12px]">{short(inst.did)}</span>} />
        <KV label="Wallet Address" value={<span className="break-all font-mono text-[12px]">{short(inst.walletAddress)}</span>} />
        <KV label="Registered On" value={fmtDate(inst.createdAt)} />
        <KV label="ZAQA Trusted" value={inst.zaqaTrusted ? "Yes" : "No"} />
        {inst.heaNote ? <KV label="HEA Note" value={inst.heaNote} /> : null}
      </div>

      <SectionCard title="HEA Accreditation Workflow" className="mb-4" pad="p-4">
        <Timeline items={timeline} />
      </SectionCard>

      <SectionCard
        title="Accredited Programmes"
        action={<span className="text-[11px] font-semibold text-slate-500">{(inst.accreditedPrograms || []).length}</span>}
        className="mb-4"
        pad="p-3.5"
      >
        {(inst.accreditedPrograms || []).length === 0 ? (
          <div className="py-2 text-[12px] text-slate-400">No accredited programmes yet.</div>
        ) : (
          <ul className="space-y-1">
            {inst.accreditedPrograms.map((p) => (
              <li key={p} className="flex items-start gap-2 text-[12.5px] text-slate-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                {p}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Required Documents Checklist"
        action={<span className="text-[11px] font-semibold text-slate-500">Sample checklist</span>}
        className="mb-4"
        pad="p-3"
      >
        {CHECKLIST.map((c) => (
          <CheckItem key={c.label} state={c.state} label={c.label} />
        ))}
      </SectionCard>

      <div className="mb-4">
        <div className="mb-1.5 text-[12.5px] font-bold text-slate-900">Notes</div>
        <textarea
          rows={3}
          placeholder="Internal note..."
          className="w-full rounded-lg border border-slate-200 p-2.5 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <button className="mt-1.5 rounded-lg bg-slate-100 px-3.5 py-2 text-[13px] font-semibold text-slate-400" disabled>
          Save Note
        </button>
      </div>

      <div className="space-y-2.5">
        <div className="text-[12.5px] font-bold text-slate-900">Actions</div>
        {inst.hasAccreditationDoc && (
          <ActionBtn tone="outline" icon="file" full onClick={() => onViewDoc(inst.id)}>
            View Accreditation Doc
          </ActionBtn>
        )}
        {status !== "approved" && (
          <ActionBtn tone="green" icon="check" full disabled={busy === inst.id} onClick={() => onApprove(inst.id)}>
            {busy === inst.id ? "Working…" : "Approve Institution"}
          </ActionBtn>
        )}
        <ActionBtn tone="softpurple" icon="calendar" full>Schedule Inspection</ActionBtn>
        {status !== "pending" && (
          <ActionBtn tone="softorange" full disabled={busy === inst.id} onClick={() => onReturn(inst.id)}>
            Return for Clarification
          </ActionBtn>
        )}
        {status !== "suspended" && (
          <ActionBtn tone="softred" full disabled={busy === inst.id} onClick={() => onReject(inst.id)}>
            Reject
          </ActionBtn>
        )}
      </div>
    </div>
  );
}

export default function HeaInstitutionsPage() {
  const { ready, user, token } = usePortalGuard(["hea"]);
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.heaInstitutions(token);
      setInstitutions(r.institutions || []);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function approve(id) {
    setBusy(id); setError(null);
    try {
      const r = await api.heaApprove(token, id);
      if (r.warning) setError(r.warning);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  async function reject(id) {
    const reason = prompt("Reason for rejection (optional):");
    if (reason === null) return;
    setBusy(id); setError(null);
    try { await api.heaReject(token, id, reason); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  async function returnForClarification(id) {
    const note = prompt("Clarification note to the institution (optional):");
    if (note === null) return;
    setBusy(id); setError(null);
    try { await api.heaSetStatus(token, id, "pending", note); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  async function viewDoc(id) {
    try { openBlob(await api.accreditationDoc(token, "hea", id)); }
    catch (err) { setError(err.message); }
  }

  if (!ready) return null;

  const counts = institutions.reduce((m, i) => {
    const s = i.heaStatus || "approved";
    m[s] = (m[s] || 0) + 1;
    return m;
  }, {});
  const selfRegCount = institutions.filter((i) => i.selfRegistered).length;

  const kpis = [
    { icon: "bank", iconTone: "softblue", label: "Total Institutions", value: String(institutions.length) },
    { icon: "folder", iconTone: "softgreen", label: "Self-Registered", value: String(selfRegCount) },
    { icon: "clock", iconTone: "amber", label: "Under Review", value: String(counts.pending || 0) },
    { icon: "file", iconTone: "purple", label: "On-Chain Issuers", value: String(institutions.filter((i) => i.onChain).length) },
    { icon: "checkCircle", iconTone: "softgreen", label: "Approved", value: String(counts.approved || 0) },
    { icon: "shield", iconTone: "softred", label: "Rejected / Suspended", value: String(counts.suspended || 0) },
  ];

  const tabs = [
    { label: "All", count: institutions.length },
    { label: "Submitted", count: 0 },
    { label: "Under Review", count: counts.pending || 0 },
    { label: "Site Inspection", count: 0 },
    { label: "Approved", count: counts.approved || 0 },
    { label: "Returned", count: 0 },
    { label: "Rejected", count: counts.suspended || 0 },
  ];
  const TAB_STATUS = { "Under Review": "pending", Approved: "approved", Rejected: "suspended" };

  const rows = institutions.filter((r) => {
    const s = r.heaStatus || "approved";
    if (tab !== "All") {
      const want = TAB_STATUS[tab];
      if (!want || s !== want) return false;
    }
    return !q || (r.institution + (r.sector || "")).toLowerCase().includes(q.toLowerCase());
  });
  const selected = institutions.find((r) => r.id === sel) || rows[0] || institutions[0] || null;

  return (
    <PortalShell
      portal="hea"
      active="institutions"
      title="HEA Portal – Institution Registration & Accreditation"
      subtitle="Onboard new institutions and manage accreditation workflows in line with the Higher Education Act No. 4 of 2013."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={<ActionBtn tone="navy" icon="plus">Register New Institution</ActionBtn>}
      panel={
        selected ? (
          <DetailPanel
            inst={selected}
            busy={busy}
            onApprove={approve}
            onReject={reject}
            onReturn={returnForClarification}
            onViewDoc={viewDoc}
          />
        ) : (
          <div className="py-10 text-center text-[13px] text-slate-400">No institution selected.</div>
        )
      }
      panelWidth="w-[400px]"
    >
      <StatRow cols={6}>
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </StatRow>

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-64" placeholder="Search institutions..." value={q} onChange={setQ} />
          <SelectPill label="Type: All" />
          <SelectPill label="Ownership: All" />
          <SelectPill label="Status: All" />
          <ToolButton icon="filter">Filters</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load} />
        </div>
        {error && <div className="mb-3 text-[12px] font-medium text-red-600">{error}</div>}
        <DataTable
          rowKey="id"
          activeKey={selected?.id}
          onRowClick={(r) => setSel(r.id)}
          columns={[
            { key: "institution", label: "Institution Name", render: (r) => <span className="font-semibold text-slate-800">{r.institution}</span> },
            { key: "sector", label: "Type", render: (r) => SECTOR_LABEL[r.sector] || r.sector || "—" },
            { key: "ownership", label: "Registration", render: (r) => (r.selfRegistered ? "Self-Registered" : "HEA Registered") },
            {
              key: "status", label: "Application Status",
              render: (r) => <Badge tone={STATUS_TONE[r.heaStatus] || "slate"}>{STATUS_LABEL[r.heaStatus] || r.heaStatus || "—"}</Badge>,
            },
            { key: "submitted", label: "Submitted Date", render: (r) => fmtDate(r.createdAt) },
            { key: "approvedBy", label: "Approved By", render: (r) => r.approvedBy || "—" },
            {
              key: "onChain", label: "On-Chain",
              render: (r) => <Badge tone={r.onChain ? "outline" : "amber"}>{r.onChain ? "Anchored" : "Pending"}</Badge>,
            },
            {
              key: "action",
              label: "Action",
              render: (r) => (
                <span className="flex items-center gap-2">
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={(e) => { e.stopPropagation(); setSel(r.id); }}
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
        {rows.length === 0 && (
          <div className="border-b border-slate-100 py-8 text-center text-[13px] text-slate-400">No records yet.</div>
        )}
        <Pagination
          summary={`Showing ${rows.length} of ${institutions.length} results`}
          page={1}
          pages={1}
          className="border-t border-slate-100"
        />
        <div className="flex justify-end pb-3">
          <SelectPill label="10 / page" />
        </div>
      </div>
    </PortalShell>
  );
}
