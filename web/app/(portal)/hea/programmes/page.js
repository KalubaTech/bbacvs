"use client";

import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, StatCard, StatRow, SectionCard, SelectPill, SearchBox,
  ToolButton, DataTable, Pagination, usePager, KVGrid, ActionBtn,
  PanelHeader, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const STATUS_TONE = { pending: "amber", approved: "green", rejected: "red", draft: "slate" };
const STATUS_LABEL = { pending: "Pending Review", approved: "Approved", rejected: "Rejected", draft: "Draft" };

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

      <SectionCard title="History" className="mb-4" pad="p-4">
        <CaseTimeline events={prog.events} />
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
          <ActionBtn tone="softred" icon="x" disabled={busy === prog.id} onClick={() => onReject(prog.id)}>
            Reject
          </ActionBtn>
        </div>
      </div>
    </div>
  );
}

export default function HeaProgrammesPage() {
  const { ready, token } = usePortalGuard(["hea"]);
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
        api.pendingProgrammes(token),
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

  if (!ready) return null;

  const accreditedTotal = institutions.reduce((n, i) => n + (i.accreditedPrograms?.length || 0), 0);
  const kpis = [
    { icon: "folder", iconTone: "purple", label: "In Review Queue", value: String(programmes.length) },
    { icon: "shieldCheck", iconTone: "softgreen", label: "Accredited Programmes", value: String(accreditedTotal) },
    { icon: "registry", iconTone: "softblue", label: "Linked to NQF Register", value: String(programmes.filter((p) => p.qualificationRef).length) },
    { icon: "bank", iconTone: "amber", label: "Institutions With Submissions", value: String(new Set(programmes.map((p) => p.institution)).size) },
  ];

  const progInstitutions = [...new Set(programmes.map((p) => p.institution).filter(Boolean))];
  const levels = [...new Set(programmes.map((p) => p.zqfLevel).filter(Boolean))].sort((a, b) => a - b);

  const rows = programmes.filter(
    (r) =>
      (!instFilter || r.institution === instFilter) &&
      (!levelFilter || String(r.zqfLevel) === String(levelFilter)) &&
      (!q || ((r.name || "") + (r.institution || "") + (r.qualificationRef || "")).toLowerCase().includes(q.toLowerCase()))
  );
  const pager = usePager(rows, 10, [q, instFilter, levelFilter]);
  const selected = sel === null ? null : programmes.find((r) => r.id === sel) || rows[0] || null;

  const columns = [
    { key: "name", label: "Programme Title", render: (r) => <span className="font-semibold text-slate-800">{r.name}</span> },
    { key: "institution", label: "Institution", render: (r) => r.institution || "—" },
    { key: "qualificationRef", label: "Qualification Ref.", render: (r) => r.qualificationRef || "—" },
    { key: "zqfLevel", label: "NQF Level", tdClass: "text-center", thClass: "text-center", render: (r) => r.zqfLevel || "—" },
    { key: "createdAt", label: "Submission Date", csv: (r) => fmtDate(r.createdAt), render: (r) => fmtDate(r.createdAt) },
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
      subtitle="Review and decide on degree, diploma and certificate programmes submitted for accreditation."
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
          <div className="py-10 text-center text-[13px] text-slate-400">No programmes awaiting review.</div>
        )
      }
      panelKey={selected?.id}
      panelWidth="w-[440px]"
    >
      <StatRow cols={4}>
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
          <ToolButton icon="download" onClick={() => exportCSV("hea-programme-queue", columns, rows)}>Export</ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load}>Refresh</ToolButton>
        </div>
        <DataTable
          rowKey="id"
          loading={loading}
          activeKey={selected?.id}
          onRowClick={(r) => setSel(r.id)}
          columns={columns}
          rows={pager.rows}
          emptyText="No programmes awaiting accreditation."
          footer={<Pagination {...pager.props} className="border-t border-slate-100" />}
        />
      </SectionCard>
    </PortalShell>
  );
}
