"use client";

import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SearchBox,
  ToolButton, DataTable, Pagination, usePager, KVGrid, ActionBtn,
  PanelHeader, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";
import { SECTOR_LABEL, StatusActionModal } from "../shared";

// Most recent event that put the institution into the suspended state.
function suspensionEvent(inst) {
  const ev = inst.events || [];
  for (let i = ev.length - 1; i >= 0; i--) {
    const a = ev[i].action || "";
    if (a === "institution.suspended" || a === "institution.accreditation_rejected" || ev[i].meta?.to === "suspended") return ev[i];
  }
  return null;
}

function DetailPanel({ inst, busy, onClose, onLift, onRenote }) {
  const susp = suspensionEvent(inst);
  return (
    <div>
      <PanelHeader title="Sanction Details" badge={<Badge tone="red">Suspended</Badge>} onClose={onClose} />

      <div className="mb-4 flex items-start gap-3">
        <Avatar name={inst.institution} size="h-11 w-11" />
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-slate-900">{inst.institution}</div>
          <div className="mt-0.5 text-[12px] text-slate-500">{SECTOR_LABEL[inst.sector] || inst.sector || "Higher Education"}</div>
        </div>
      </div>

      <SectionCard title="Suspension Facts" className="mb-4" pad="p-4">
        <KVGrid
          cols={2}
          items={[
            { label: "Suspended Since", value: susp ? fmtDateTime(susp.at) : "—" },
            { label: "Suspended By", value: susp?.actor && susp.actor !== "system" ? susp.actor : "System" },
            { label: "Registered On", value: fmtDate(inst.createdAt) },
            { label: "On-Chain", value: inst.onChain ? "Anchored" : "Pending" },
          ]}
        />
        <div className="mt-3 rounded-lg border border-red-100 bg-red-50 p-2.5 text-[12px] text-red-700">
          <span className="font-semibold">Suspension note:</span> {inst.heaNote || "No note recorded."}
        </div>
      </SectionCard>

      <SectionCard title="Regulatory History" className="mb-4" pad="p-4">
        <CaseTimeline events={inst.events} />
      </SectionCard>

      <div className="space-y-2.5">
        <div className="text-[12.5px] font-bold text-slate-900">Actions</div>
        <ActionBtn tone="softgreen" icon="check" full disabled={busy === inst.id} onClick={() => onLift(inst)}>
          Lift Suspension
        </ActionBtn>
        <ActionBtn tone="softorange" icon="edit" full disabled={busy === inst.id} onClick={() => onRenote(inst)}>
          Keep Suspended With New Note
        </ActionBtn>
      </div>
    </div>
  );
}

export default function HeaEnforcementPage() {
  const { ready, token } = usePortalGuard(["hea"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(undefined);
  const [modal, setModal] = useState(null); // {inst, mode: "lift" | "renote"}
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.heaInstitutions(token);
      setInstitutions(r.institutions || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function setStatus(inst, heaStatus, note) {
    setBusy(inst.id); setError(null);
    try {
      await api.heaSetStatus(token, inst.id, heaStatus, note);
      setModal(null);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }


  const suspended = institutions.filter((i) => i.heaStatus === "suspended");

  const kpis = [
    { icon: "alert", iconTone: "softred", label: "Active Suspensions", value: String(suspended.length) },
    { icon: "fileText", iconTone: "amber", label: "With Recorded Reason", value: String(suspended.filter((i) => i.heaNote).length) },
    { icon: "link", iconTone: "purple", label: "On-Chain Issuers Suspended", value: String(suspended.filter((i) => i.onChain).length) },
    { icon: "bank", iconTone: "softblue", label: "Institutions Overall", value: String(institutions.length) },
  ];

  const rows = suspended.filter(
    (r) => !q || (r.institution + (r.heaNote || "")).toLowerCase().includes(q.toLowerCase())
  );
  const pager = usePager(rows, 10, [q]);
  if (!ready) return null;
  const selected = sel === null ? null : suspended.find((r) => r.id === sel) || rows[0] || null;

  const columns = [
    { key: "institution", label: "Institution", render: (r) => <span className="font-semibold text-slate-800">{r.institution}</span> },
    { key: "sector", label: "Type", csv: (r) => SECTOR_LABEL[r.sector] || r.sector || "", render: (r) => SECTOR_LABEL[r.sector] || r.sector || "—" },
    {
      key: "note", label: "Suspension Note", csv: (r) => r.heaNote || "",
      render: (r) => <span className="block max-w-[320px] truncate">{r.heaNote || "—"}</span>,
    },
    {
      key: "since", label: "Suspended Since", csv: (r) => fmtDateTime(suspensionEvent(r)?.at),
      render: (r) => {
        const e = suspensionEvent(r);
        return e ? fmtDateTime(e.at) : "—";
      },
    },
    {
      key: "onChain", label: "On-Chain", csv: (r) => (r.onChain ? "Anchored" : "Pending"),
      render: (r) => <Badge tone={r.onChain ? "outline" : "amber"}>{r.onChain ? "Anchored" : "Pending"}</Badge>,
    },
  ];

  return (
    <PortalShell
      portal="hea"
      active="enforcement"
      title="HEA Portal – Enforcement & Sanctions"
      panel={
        selected ? (
          <DetailPanel
            key={selected.id}
            inst={selected}
            busy={busy}
            onClose={() => setSel(null)}
            onLift={(inst) => setModal({ inst, mode: "lift" })}
            onRenote={(inst) => setModal({ inst, mode: "renote" })}
          />
        ) : (
          <div className="py-10 text-center text-[13px] text-slate-400">No suspended institution selected.</div>
        )
      }
      panelKey={selected?.id}
      panelWidth="w-[420px]"
    >
      <StatRow cols={4}>
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </StatRow>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            Active Sanctions
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600">{suspended.length}</span>
          </span>
        }
        pad="p-4"
      >
        <ErrorBanner error={error} onRetry={load} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-64" placeholder="Search suspended institutions..." value={q} onChange={setQ} />
          <ToolButton icon="download" onClick={() => exportCSV("hea-active-sanctions", columns, rows)}>Export</ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load}>Refresh</ToolButton>
        </div>
        <DataTable
          rowKey="id"
          loading={loading}
          activeKey={selected?.id}
          onRowClick={(r) => setSel(r.id)}
          columns={columns}
          rows={pager.rows}
          emptyText="No active suspensions — all institutions are in good standing."
          footer={<Pagination {...pager.props} className="border-t border-slate-100" />}
        />
      </SectionCard>

      {modal && (
        <StatusActionModal
          key={`${modal.inst.id}-${modal.mode}`}
          open
          title={modal.mode === "lift" ? `Lift suspension of ${modal.inst.institution}` : `Update suspension note for ${modal.inst.institution}`}
          description={
            modal.mode === "lift"
              ? "Lifting the suspension restores the institution to approved standing and its ability to issue credentials. The note is recorded on the audit trail."
              : "The institution remains suspended; the new note replaces the current suspension reason and is recorded on the audit trail."
          }
          actionLabel={modal.mode === "lift" ? "Lift Suspension" : "Keep Suspended"}
          tone={modal.mode === "lift" ? "green" : "red"}
          noteRequired={modal.mode === "renote"}
          initialNote={modal.mode === "renote" ? modal.inst.heaNote || "" : ""}
          busy={busy === modal.inst.id}
          onClose={() => setModal(null)}
          onSubmit={(note) => setStatus(modal.inst, modal.mode === "lift" ? "approved" : "suspended", note)}
        />
      )}
    </PortalShell>
  );
}
