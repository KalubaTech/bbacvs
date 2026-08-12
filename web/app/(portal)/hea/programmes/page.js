"use client";

import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, StatCard, StatRow, SectionCard, SelectPill, SearchBox,
  ToolButton, DataTable, Pagination, TabBar, KVGrid, ActionBtn,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const STATUS_TONE = { pending: "amber", approved: "green", rejected: "red", draft: "slate" };
const STATUS_LABEL = { pending: "Pending Review", approved: "Approved", rejected: "Rejected", draft: "Draft" };

function DetailPanel({ prog, busy, onApprove, onReject }) {
  const [tab, setTab] = useState("Overview");
  return (
    <div>
      <div className="mb-1 flex items-start justify-between gap-3">
        <Badge tone={STATUS_TONE[prog.status] || "slate"}>{(STATUS_LABEL[prog.status] || prog.status).toUpperCase()}</Badge>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>
      <h2 className="text-[15px] font-bold text-slate-900">{prog.name}</h2>
      <div className="mb-3 text-[12px] text-slate-500">Application ID: {prog.id}</div>

      <div className="mb-4">
        <TabBar tabs={["Overview", "Documents", "Review History", "Communications"]} active={tab} onChange={setTab} />
      </div>

      <SectionCard title="Programme Summary" className="mb-4" pad="p-4">
        <KVGrid
          cols={2}
          items={[
            { label: "Institution", value: prog.institution || "—" },
            { label: "NQF Level", value: prog.zqfLevel || "—" },
            { label: "Registered Qualification Ref.", value: prog.qualificationRef || "—" },
            { label: "Submission Date", value: fmtDate(prog.createdAt) },
            { label: "Status", value: STATUS_LABEL[prog.status] || prog.status },
            { label: "Regulator Note", value: prog.note || "—" },
          ]}
        />
      </SectionCard>

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <div className="mb-1 text-[12px] font-semibold text-slate-800">Review Guidance</div>
        <p className="text-[12px] leading-relaxed text-slate-600">
          Approving adds the programme to the institution&apos;s accredited-programme list, which is
          surfaced to ZAQA and to public verifiers. Rejection returns the programme to the
          institution with your reason.
        </p>
      </div>

      <div>
        <div className="mb-2 text-[12.5px] font-bold text-slate-900">Actions</div>
        <div className="flex flex-wrap gap-2.5">
          <ActionBtn tone="green" icon="check" disabled={busy === prog.id} onClick={() => onApprove(prog.id)}>
            {busy === prog.id ? "Working…" : "Recommend Approval"}
          </ActionBtn>
          <ActionBtn tone="softorange" icon="edit">Request Changes</ActionBtn>
          <ActionBtn tone="softblue" icon="calendar">Schedule Site Visit</ActionBtn>
          <ActionBtn tone="softred" icon="x" disabled={busy === prog.id} onClick={() => onReject(prog.id)}>
            Reject
          </ActionBtn>
        </div>
      </div>
    </div>
  );
}

export default function HeaProgrammesPage() {
  const { ready, user, token } = usePortalGuard(["hea"]);
  const [pill, setPill] = useState("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [programmes, setProgrammes] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const [progs, inst] = await Promise.all([
        api.pendingProgrammes(token),
        api.heaInstitutions(token),
      ]);
      setProgrammes(progs.programmes || []);
      setInstitutions(inst.institutions || []);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function approve(id) {
    setBusy(id); setError(null);
    try { await api.approveProgramme(token, id); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  async function reject(id) {
    const reason = prompt("Reason for rejection (optional):");
    if (reason === null) return;
    setBusy(id); setError(null);
    try { await api.rejectProgramme(token, id, reason); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  if (!ready) return null;

  const accreditedTotal = institutions.reduce((n, i) => n + (i.accreditedPrograms?.length || 0), 0);
  const kpis = [
    { icon: "folder", iconTone: "purple", label: "In Review Queue", value: String(programmes.length) },
    { icon: "fileText", iconTone: "amber", label: "Awaiting Decision", value: String(programmes.length) },
    { icon: "calendar", iconTone: "softblue", label: "Site Visits Scheduled", value: "0" },
    { icon: "users", iconTone: "amber", label: "Under Committee Review", value: "0" },
    { icon: "shieldCheck", iconTone: "softgreen", label: "Accredited Programmes", value: String(accreditedTotal) },
    { icon: "xCircle", iconTone: "softred", label: "Linked to NQF Register", value: String(programmes.filter((p) => p.qualificationRef).length) },
  ];

  const pills = [
    { label: "All", count: programmes.length },
    { label: "Submitted", count: programmes.length },
    { label: "Document Review", count: 0 },
    { label: "Site Visit", count: 0 },
    { label: "Under Committee Review", count: 0 },
  ];

  const rows = programmes.filter(
    (r) =>
      (pill === "All" || pill === "Submitted") &&
      (!q || ((r.name || "") + (r.institution || "") + (r.qualificationRef || "")).toLowerCase().includes(q.toLowerCase()))
  );
  const selected = programmes.find((r) => r.id === sel) || rows[0] || programmes[0] || null;

  return (
    <PortalShell
      portal="hea"
      active="programmes"
      title="HEA Portal – Programme Accreditation Review"
      subtitle="Review and decide on degree, diploma and certificate programmes submitted for accreditation."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={
        <>
          <ActionBtn tone="navy" icon="plus">New Programme Application</ActionBtn>
          <SelectPill label="All time" />
        </>
      }
      panel={
        selected ? (
          <DetailPanel prog={selected} key={selected.id} busy={busy} onApprove={approve} onReject={reject} />
        ) : (
          <div className="py-10 text-center text-[13px] text-slate-400">No programmes awaiting review.</div>
        )
      }
      panelWidth="w-[440px]"
    >
      <StatRow cols={6}>
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </StatRow>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            Programme Accreditation Queue
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-700">{programmes.length}</span>
          </span>
        }
        pad="p-4"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-72" placeholder="Search programmes..." value={q} onChange={setQ} />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load} />
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {pills.map((p) => {
            const on = p.label === pill;
            return (
              <button
                key={p.label}
                onClick={() => setPill(p.label)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition ${
                  on
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {p.label}
                <span className={`rounded-full px-1.5 text-[10.5px] ${on ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {p.count}
                </span>
              </button>
            );
          })}
        </div>
        {error && <div className="mb-3 text-[12px] font-medium text-red-600">{error}</div>}
        <DataTable
          rowKey="id"
          activeKey={selected?.id}
          onRowClick={(r) => setSel(r.id)}
          columns={[
            {
              key: "check",
              label: "",
              thClass: "w-8",
              render: (r) => (
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={r.id === selected?.id}
                  onClick={(e) => e.stopPropagation()}
                  readOnly
                />
              ),
            },
            { key: "name", label: "Programme Title", render: (r) => <span className="font-semibold text-slate-800">{r.name}</span> },
            { key: "institution", label: "Institution", render: (r) => r.institution || "—" },
            { key: "qualificationRef", label: "Qualification Ref.", render: (r) => r.qualificationRef || "—" },
            { key: "zqfLevel", label: "NQF Level", tdClass: "text-center", thClass: "text-center", render: (r) => r.zqfLevel || "—" },
            { key: "createdAt", label: "Submission Date", render: (r) => fmtDate(r.createdAt) },
            {
              key: "status", label: "Status",
              render: (r) => <Badge tone={STATUS_TONE[r.status] || "slate"}>{STATUS_LABEL[r.status] || r.status}</Badge>,
            },
            { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
          ]}
          rows={rows}
        />
        {rows.length === 0 && (
          <div className="border-b border-slate-100 py-8 text-center text-[13px] text-slate-400">No records yet.</div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Pagination summary={`Showing ${rows.length} of ${programmes.length} programmes`} page={1} pages={1} className="flex-1 px-0" />
          <SelectPill label="10 / page" />
        </div>
      </SectionCard>
    </PortalShell>
  );
}
