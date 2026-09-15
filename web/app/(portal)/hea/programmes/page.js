"use client";

import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, StatCard, StatRow, SectionCard, SelectPill, SearchBox, StatusTabs,
  ToolButton, DataTable, Pagination, usePager, KVGrid, ActionBtn,
  PanelHeader, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { CatalogueView } from "../../../../components/portal/ProgrammeCatalogue";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const STATUS_TONE = { pending: "amber", approved: "green", rejected: "red", draft: "slate" };
const STATUS_LABEL = { pending: "Pending Review", approved: "Accredited", rejected: "Rejected", draft: "Draft" };

// Tabs over the full accreditation register — the review queue plus every decided programme.
// HEA is the final authority on higher-education programme accreditation; ZAQA reads these
// outcomes for validation and verification and never accredits programmes itself.
const TABS = [
  { label: "Review Queue", states: ["pending"] },
  { label: "Accredited", states: ["approved"] },
  { label: "Rejected", states: ["rejected"] },
  { label: "Drafts (not yet submitted)", states: ["draft"] },
  { label: "All", states: ["pending", "approved", "rejected", "draft"] },
];

function DetailPanel({ prog, busy, onClose, onApprove, onReject }) {
  return (
    <div>
      <PanelHeader
        title={prog.name}
        badge={<Badge tone={STATUS_TONE[prog.status] || "slate"}>{STATUS_LABEL[prog.status] || prog.status}</Badge>}
        onClose={onClose}
      />
      <div className="-mt-2 mb-4 text-[12px] text-slate-500">Application ID: {prog.id}</div>

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

      <SectionCard title="Cycle Register" className="mb-4" pad="p-4">
        <CatalogueView programme={prog} compact />
      </SectionCard>

      <SectionCard title="History" className="mb-4" pad="p-4">
        <CaseTimeline events={prog.events} />
      </SectionCard>

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <div className="mb-1 text-[12px] font-semibold text-slate-800">Review Guidance</div>
        <p className="text-[12px] leading-relaxed text-slate-600">
          Accrediting adds the programme to the institution&apos;s accredited-programme list. HEA is the
          final approval authority for higher-education programmes; ZAQA taps into this decision for
          credential validation and verification. Rejection returns the programme to the institution
          with your reason.
        </p>
      </div>

      {prog.status === "pending" ? (
        <div>
          <div className="mb-2 text-[12.5px] font-bold text-slate-900">Actions</div>
          <div className="flex flex-wrap gap-2.5">
            <ActionBtn tone="green" icon="check" disabled={busy === prog.id} onClick={() => onApprove(prog.id)}>
              {busy === prog.id ? "Working…" : "Accredit Programme"}
            </ActionBtn>
            <ActionBtn tone="softred" icon="x" disabled={busy === prog.id} onClick={() => onReject(prog.id)}>
              Reject
            </ActionBtn>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-slate-400">
          {prog.status === "approved"
            ? `Accredited${prog.decidedAt ? ` on ${fmtDate(prog.decidedAt)}` : ""} — this decision is read by ZAQA for validation.`
            : prog.status === "rejected"
            ? "Rejected — the institution may revise and resubmit."
            : "Draft — the institution has not submitted this programme yet."}
        </p>
      )}
    </div>
  );
}

export default function HeaProgrammesPage() {
  const { ready, token } = usePortalGuard(["hea"]);
  const [tab, setTab] = useState("Review Queue");
  const [q, setQ] = useState("");
  const [instFilter, setInstFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [sel, setSel] = useState(undefined);
  const [programmes, setProgrammes] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [progs, inst] = await Promise.all([
        api.allProgrammes(token),
        api.heaInstitutions(token),
      ]);
      setProgrammes(progs.programmes || []);
      setInstitutions(inst.institutions || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
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


  const byState = programmes.reduce((m, p) => { m[p.status] = (m[p.status] || 0) + 1; return m; }, {});
  // Accredited programmes = every programme the HEA has approved, plus any recorded directly on
  // the institution register (legacy entries without a programme record).
  const accreditedNames = new Set(programmes.filter((p) => p.status === "approved").map((p) => `${p.institution}::${p.name}`));
  institutions.forEach((i) => (i.accreditedPrograms || []).forEach((n) => accreditedNames.add(`${i.institution}::${n}`)));
  const kpis = [
    { icon: "folder", iconTone: "purple", label: "In Review Queue", value: String(byState.pending || 0) },
    { icon: "shieldCheck", iconTone: "softgreen", label: "Accredited Programmes", value: String(accreditedNames.size) },
    { icon: "x", iconTone: "softred", label: "Rejected", value: String(byState.rejected || 0) },
    { icon: "registry", iconTone: "softblue", label: "Linked to NQF Register", value: String(programmes.filter((p) => p.qualificationRef).length) },
    { icon: "bank", iconTone: "amber", label: "Institutions With Programmes", value: String(new Set(programmes.map((p) => p.institution)).size) },
  ];

  const tabs = TABS.map((t) => ({ label: t.label, count: programmes.filter((p) => t.states.includes(p.status)).length }));
  const activeStates = TABS.find((t) => t.label === tab)?.states || ["pending"];

  const progInstitutions = [...new Set(programmes.map((p) => p.institution).filter(Boolean))];
  const levels = [...new Set(programmes.map((p) => p.zqfLevel).filter(Boolean))].sort((a, b) => a - b);

  const rows = programmes.filter(
    (r) =>
      activeStates.includes(r.status) &&
      (!instFilter || r.institution === instFilter) &&
      (!levelFilter || String(r.zqfLevel) === String(levelFilter)) &&
      (!q || ((r.name || "") + (r.institution || "") + (r.qualificationRef || "")).toLowerCase().includes(q.toLowerCase()))
  );
  const pager = usePager(rows, 10, [tab, q, instFilter, levelFilter]);
  if (!ready) return null;
  const selected = sel === null ? null : programmes.find((r) => r.id === sel) || rows[0] || null;

  const columns = [
    { key: "name", label: "Programme Title", render: (r) => <span className="font-semibold text-slate-800">{r.name}</span> },
    { key: "institution", label: "Institution", render: (r) => r.institution || "—" },
    { key: "qualificationRef", label: "Qualification Ref.", render: (r) => r.qualificationRef || "—" },
    { key: "zqfLevel", label: "NQF Level", tdClass: "text-center", thClass: "text-center", render: (r) => r.zqfLevel || "—" },
    { key: "createdAt", label: "Submitted", csv: (r) => fmtDate(r.createdAt), render: (r) => fmtDate(r.createdAt) },
    { key: "decidedAt", label: "Decided", csv: (r) => (r.decidedAt ? fmtDate(r.decidedAt) : ""), render: (r) => (r.decidedAt ? fmtDate(r.decidedAt) : "—") },
    {
      key: "status", label: "Status", csv: (r) => STATUS_LABEL[r.status] || r.status,
      render: (r) => <Badge tone={STATUS_TONE[r.status] || "slate"}>{STATUS_LABEL[r.status] || r.status}</Badge>,
    },
  ];

  return (
    <PortalShell
      portal="hea"
      active="programmes"
      title="HEA Portal – Programme Accreditation Review"
      panel={
        selected ? (
          <DetailPanel
            key={selected.id}
            prog={selected}
            busy={busy}
            onClose={() => setSel(null)}
            onApprove={approve}
            onReject={reject}
          />
        ) : (
          <div className="py-10 text-center text-[13px] text-slate-400">Select a programme to see its record.</div>
        )
      }
      panelKey={selected?.id}
      panelWidth="w-[440px]"
    >
      <StatRow cols={5}>
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </StatRow>

      <SectionCard title="Programme Accreditation Register" pad="p-4">
        <StatusTabs tabs={tabs} active={tab} onChange={setTab} />
        <ErrorBanner error={error} onRetry={load} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-72" placeholder="Search programmes..." value={q} onChange={setQ} />
          <SelectPill
            label="Institution"
            value={instFilter}
            onChange={setInstFilter}
            options={progInstitutions}
          />
          <SelectPill
            label="NQF Level"
            value={levelFilter}
            onChange={setLevelFilter}
            options={levels.map((l) => ({ value: String(l), label: `Level ${l}` }))}
          />
          <ToolButton icon="download" onClick={() => exportCSV("hea-programme-register", columns, rows)}>Export</ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load}>Refresh</ToolButton>
        </div>
        <DataTable
          rowKey="id"
          loading={loading}
          activeKey={selected?.id}
          onRowClick={(r) => setSel(r.id)}
          columns={columns}
          rows={pager.rows}
          emptyText={tab === "Review Queue" ? "No programmes awaiting accreditation." : `No programmes under ${tab}.`}
          footer={<Pagination {...pager.props} className="border-t border-slate-100" />}
        />
      </SectionCard>
    </PortalShell>
  );
}
