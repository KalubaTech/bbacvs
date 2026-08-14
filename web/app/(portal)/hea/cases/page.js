"use client";

import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SelectPill, SearchBox,
  ToolButton, DataTable, Pagination, usePager, KVGrid, ActionBtn,
  PanelHeader, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";
import { STATUS_LABEL, STATUS_TONE, SECTOR_LABEL, humanizeAction, actionTone, lastEvent, StatusActionModal } from "../shared";

function DetailPanel({ inst, busy, onClose, onSuspend, onReinstate }) {
  const status = inst.heaStatus || "approved";
  return (
    <div>
      <PanelHeader
        title="Case File"
        badge={<Badge tone={STATUS_TONE[status] || "slate"}>{STATUS_LABEL[status] || status}</Badge>}
        onClose={onClose}
      />

      <div className="mb-4 flex items-start gap-3">
        <Avatar name={inst.institution} size="h-11 w-11" />
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-slate-900">{inst.institution}</div>
          <div className="mt-0.5 text-[12px] text-slate-500">{SECTOR_LABEL[inst.sector] || inst.sector || "Higher Education"}</div>
        </div>
      </div>

      <SectionCard title="Case Facts" className="mb-4" pad="p-4">
        <KVGrid
          cols={2}
          items={[
            { label: "Registered On", value: fmtDate(inst.createdAt) },
            { label: "Regulatory Actions", value: String((inst.events || []).length) },
            { label: "ZAQA Trusted", value: inst.zaqaTrusted ? "Yes" : "No" },
            { label: "On-Chain", value: inst.onChain ? "Anchored" : "Pending" },
          ]}
        />
        {inst.heaNote ? (
          <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[12px] text-slate-600">
            <span className="font-semibold text-slate-700">Last regulator note:</span> {inst.heaNote}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Full Regulatory History" className="mb-4" pad="p-4">
        <CaseTimeline events={inst.events} />
      </SectionCard>

      <div className="space-y-2.5">
        <div className="text-[12.5px] font-bold text-slate-900">Actions</div>
        {status !== "suspended" ? (
          <ActionBtn tone="softred" icon="alert" full disabled={busy === inst.id} onClick={() => onSuspend(inst)}>
            Suspend Institution
          </ActionBtn>
        ) : (
          <ActionBtn tone="softgreen" icon="check" full disabled={busy === inst.id} onClick={() => onReinstate(inst)}>
            Reinstate Institution
          </ActionBtn>
        )}
      </div>
    </div>
  );
}

export default function HeaCasesPage() {
  const { ready, token } = usePortalGuard(["hea"]);
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [sel, setSel] = useState(undefined);
  const [modal, setModal] = useState(null); // {inst, mode}
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

  if (!ready) return null;

  // A "case" is any institution with a recorded regulatory history (append-only events[]).
  const cases = institutions.filter((i) => (i.events || []).length > 0);
  const actionTypes = [...new Set(cases.map((c) => lastEvent(c)?.action).filter(Boolean))];

  const totalActions = cases.reduce((n, c) => n + c.events.length, 0);
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const recentActions = cases.reduce(
    (n, c) => n + c.events.filter((e) => e.at && new Date(e.at).getTime() >= cutoff).length,
    0
  );

  const kpis = [
    { icon: "scale", iconTone: "softblue", label: "Institutions With Case History", value: String(cases.length) },
    { icon: "audit", iconTone: "purple", label: "Regulatory Actions Recorded", value: String(totalActions) },
    { icon: "clock", iconTone: "amber", label: "Actions – Last 30 Days", value: String(recentActions) },
    { icon: "alert", iconTone: "softred", label: "Currently Suspended", value: String(cases.filter((c) => c.heaStatus === "suspended").length) },
  ];

  const rows = cases.filter((r) => {
    if (actionFilter && lastEvent(r)?.action !== actionFilter) return false;
    return !q || (r.institution + (r.sector || "")).toLowerCase().includes(q.toLowerCase());
  });
  const pager = usePager(rows, 10, [q, actionFilter]);
  const selected = sel === null ? null : cases.find((r) => r.id === sel) || rows[0] || null;

  const columns = [
    { key: "institution", label: "Institution", render: (r) => <span className="font-semibold text-slate-800">{r.institution}</span> },
    {
      key: "lastAction", label: "Last Action", csv: (r) => humanizeAction(lastEvent(r)?.action),
      render: (r) => {
        const e = lastEvent(r);
        return e ? <Badge tone={actionTone(e.action)}>{humanizeAction(e.action)}</Badge> : "—";
      },
    },
    {
      key: "actor", label: "By", csv: (r) => lastEvent(r)?.actor || "System",
      render: (r) => {
        const e = lastEvent(r);
        return e?.actor && e.actor !== "system" ? e.actor : "System";
      },
    },
    { key: "when", label: "When", csv: (r) => fmtDateTime(lastEvent(r)?.at), render: (r) => fmtDateTime(lastEvent(r)?.at) },
    {
      key: "actions", label: "Actions on File", tdClass: "text-center", thClass: "text-center",
      csv: (r) => r.events.length, render: (r) => r.events.length,
    },
    {
      key: "status", label: "Status", csv: (r) => STATUS_LABEL[r.heaStatus] || r.heaStatus || "",
      render: (r) => <Badge tone={STATUS_TONE[r.heaStatus] || "slate"}>{STATUS_LABEL[r.heaStatus] || r.heaStatus || "—"}</Badge>,
    },
  ];

  return (
    <PortalShell
      portal="hea"
      active="cases"
      title="HEA Portal – Regulatory Cases"
      subtitle="The historical record of every regulatory action taken against higher-education institutions — a visible, append-only audit trail."
      panel={
        selected ? (
          <DetailPanel
            key={selected.id}
            inst={selected}
            busy={busy}
            onClose={() => setSel(null)}
            onSuspend={(inst) => setModal({ inst, mode: "suspend" })}
            onReinstate={(inst) => setModal({ inst, mode: "reinstate" })}
          />
        ) : (
          <div className="py-10 text-center text-[13px] text-slate-400">No case selected.</div>
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

      <SectionCard title="Case Register" pad="p-4">
        <ErrorBanner error={error} onRetry={load} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-64" placeholder="Search institutions..." value={q} onChange={setQ} />
          <SelectPill
            label="Last Action"
            value={actionFilter}
            onChange={setActionFilter}
            options={actionTypes.map((a) => ({ value: a, label: humanizeAction(a) }))}
          />
          <ToolButton icon="download" onClick={() => exportCSV("hea-regulatory-cases", columns, rows)}>Export</ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load}>Refresh</ToolButton>
        </div>
        <DataTable
          rowKey="id"
          loading={loading}
          activeKey={selected?.id}
          onRowClick={(r) => setSel(r.id)}
          columns={columns}
          rows={pager.rows}
          emptyText="No regulatory case history recorded yet."
          footer={<Pagination {...pager.props} className="border-t border-slate-100" />}
        />
      </SectionCard>

      {modal && (
        <StatusActionModal
          key={`${modal.inst.id}-${modal.mode}`}
          open
          title={modal.mode === "suspend" ? `Suspend ${modal.inst.institution}` : `Reinstate ${modal.inst.institution}`}
          description={
            modal.mode === "suspend"
              ? "Suspension immediately withdraws the institution's ability to issue credentials on the platform. The reason is recorded on the audit trail and visible to ZAQA."
              : "Reinstatement restores the institution to approved standing. The note is recorded on the audit trail."
          }
          actionLabel={modal.mode === "suspend" ? "Suspend Institution" : "Reinstate Institution"}
          tone={modal.mode === "suspend" ? "red" : "green"}
          noteRequired={modal.mode === "suspend"}
          busy={busy === modal.inst.id}
          onClose={() => setModal(null)}
          onSubmit={(note) => setStatus(modal.inst, modal.mode === "suspend" ? "suspended" : "approved", note)}
        />
      )}
    </PortalShell>
  );
}
