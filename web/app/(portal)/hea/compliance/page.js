"use client";

import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SelectPill, SearchBox,
  ToolButton, DataTable, Pagination, usePager, KVGrid, KVRow, ActionBtn,
  PanelHeader, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api, openBlob } from "../../../../lib/api";
import { STATUS_LABEL, STATUS_TONE, SECTOR_LABEL, StatusActionModal } from "../shared";

const short = (v) => (v && v.length > 22 ? `${v.slice(0, 12)}…${v.slice(-6)}` : v || "—");

function DetailPanel({ inst, stats, busy, onClose, onSuspend, onReinstate, onViewDoc }) {
  const status = inst.heaStatus || "approved";
  return (
    <div>
      <PanelHeader
        title="Compliance Record"
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

      <SectionCard title="Institution Facts" className="mb-4" pad="p-4">
        <KVGrid
          cols={2}
          items={[
            { label: "DID", value: <span className="break-all font-mono text-[11px]">{short(inst.did)}</span> },
            { label: "Registered On", value: fmtDate(inst.createdAt) },
            { label: "Accredited Programmes", value: String((inst.accreditedPrograms || []).length) },
            { label: "ZAQA Trusted", value: inst.zaqaTrusted ? "Yes" : "No" },
            { label: "On-Chain", value: inst.onChain ? "Anchored" : "Pending" },
            { label: "Registration", value: inst.selfRegistered ? "Self-registered" : "HEA registered" },
          ]}
        />
        {inst.heaNote ? (
          <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[12px] text-slate-600">
            <span className="font-semibold text-slate-700">Last regulator note:</span> {inst.heaNote}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Credential Issuance" className="mb-4" pad="p-3.5">
        <KVRow label="Total issued (last 200 indexed)" value={String(stats.total)} />
        <KVRow label="Active" value={<span className="text-emerald-600">{String(stats.active)}</span>} />
        <KVRow label="Revoked" value={<span className="text-red-600">{String(stats.revoked)}</span>} />
      </SectionCard>

      <SectionCard title="Regulatory History" className="mb-4" pad="p-4">
        <CaseTimeline events={inst.events} />
      </SectionCard>

      <div className="space-y-2.5">
        <div className="text-[12.5px] font-bold text-slate-900">Actions</div>
        {inst.hasAccreditationDoc && (
          <ActionBtn tone="outline" icon="file" full onClick={() => onViewDoc(inst.id)}>
            View Accreditation Document
          </ActionBtn>
        )}
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

export default function HeaCompliancePage() {
  const { ready, token } = usePortalGuard(["hea"]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [trustFilter, setTrustFilter] = useState("");
  const [sel, setSel] = useState(undefined);
  const [modal, setModal] = useState(null); // {inst, mode: "suspend" | "reinstate"}
  const [institutions, setInstitutions] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inst, mon] = await Promise.all([api.heaInstitutions(token), api.heaMonitoring(token)]);
      setInstitutions(inst.institutions || []);
      setSummary(mon.summary || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const statsFor = (inst) =>
    summary.find((s) => s.institution === inst.institution) || { total: 0, active: 0, revoked: 0 };

  async function setStatus(inst, heaStatus, note) {
    setBusy(inst.id); setError(null);
    try {
      await api.heaSetStatus(token, inst.id, heaStatus, note);
      setModal(null);
      await load();
    } catch (err) { setError(err.message); }
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
  const totals = summary.reduce(
    (t, s) => ({ total: t.total + (s.total || 0), revoked: t.revoked + (s.revoked || 0) }),
    { total: 0, revoked: 0 }
  );

  const kpis = [
    { icon: "bank", iconTone: "softblue", label: "Institutions Monitored", value: String(institutions.length) },
    { icon: "checkCircle", iconTone: "softgreen", label: "In Good Standing", value: String(counts.approved || 0) },
    { icon: "alert", iconTone: "softred", label: "Suspended", value: String(counts.suspended || 0) },
    { icon: "fileText", iconTone: "purple", label: "Credentials Issued", value: String(totals.total) },
    { icon: "revoke", iconTone: "amber", label: "Credentials Revoked", value: String(totals.revoked) },
    { icon: "shieldCheck", iconTone: "softblue", label: "ZAQA-Trusted", value: String(institutions.filter((i) => i.zaqaTrusted).length) },
  ];

  const rows = institutions.filter((r) => {
    const s = r.heaStatus || "approved";
    if (statusFilter && s !== statusFilter) return false;
    if (trustFilter === "yes" && !r.zaqaTrusted) return false;
    if (trustFilter === "no" && r.zaqaTrusted) return false;
    return !q || (r.institution + (r.sector || "")).toLowerCase().includes(q.toLowerCase());
  });
  const pager = usePager(rows, 10, [q, statusFilter, trustFilter]);
  const selected = sel === null ? null : institutions.find((r) => r.id === sel) || rows[0] || null;

  const columns = [
    { key: "institution", label: "Institution", render: (r) => <span className="font-semibold text-slate-800">{r.institution}</span> },
    {
      key: "status", label: "Status", csv: (r) => STATUS_LABEL[r.heaStatus] || r.heaStatus || "",
      render: (r) => <Badge tone={STATUS_TONE[r.heaStatus] || "slate"}>{STATUS_LABEL[r.heaStatus] || r.heaStatus || "—"}</Badge>,
    },
    {
      key: "programmes", label: "Programmes", tdClass: "text-center", thClass: "text-center",
      csv: (r) => (r.accreditedPrograms || []).length,
      render: (r) => (r.accreditedPrograms || []).length,
    },
    { key: "issued", label: "Issued", tdClass: "text-center", thClass: "text-center", csv: (r) => statsFor(r).total, render: (r) => statsFor(r).total },
    {
      key: "active", label: "Active", tdClass: "text-center", thClass: "text-center", csv: (r) => statsFor(r).active,
      render: (r) => <span className="font-semibold text-emerald-600">{statsFor(r).active}</span>,
    },
    {
      key: "revoked", label: "Revoked", tdClass: "text-center", thClass: "text-center", csv: (r) => statsFor(r).revoked,
      render: (r) => <span className={statsFor(r).revoked ? "font-semibold text-red-600" : ""}>{statsFor(r).revoked}</span>,
    },
    {
      key: "zaqaTrusted", label: "ZAQA Trusted", csv: (r) => (r.zaqaTrusted ? "Yes" : "No"),
      render: (r) => <Badge tone={r.zaqaTrusted ? "green" : "slate"}>{r.zaqaTrusted ? "Trusted" : "Not yet"}</Badge>,
    },
  ];

  return (
    <PortalShell
      portal="hea"
      active="compliance"
      title="HEA Portal – Compliance Monitoring"
      panel={
        selected ? (
          <DetailPanel
            key={selected.id}
            inst={selected}
            stats={statsFor(selected)}
            busy={busy}
            onClose={() => setSel(null)}
            onSuspend={(inst) => setModal({ inst, mode: "suspend" })}
            onReinstate={(inst) => setModal({ inst, mode: "reinstate" })}
            onViewDoc={viewDoc}
          />
        ) : (
          <div className="py-10 text-center text-[13px] text-slate-400">No institution selected.</div>
        )
      }
      panelKey={selected?.id}
      panelWidth="w-[420px]"
    >
      <StatRow cols={6}>
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </StatRow>

      <SectionCard title="Institutional Compliance Register" pad="p-4">
        <ErrorBanner error={error} onRetry={load} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-64" placeholder="Search institutions..." value={q} onChange={setQ} />
          <SelectPill
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "pending", label: "Under Review" },
              { value: "approved", label: "Approved" },
              { value: "suspended", label: "Suspended" },
            ]}
          />
          <SelectPill
            label="ZAQA Trust"
            value={trustFilter}
            onChange={setTrustFilter}
            options={[
              { value: "yes", label: "Trusted" },
              { value: "no", label: "Not trusted" },
            ]}
          />
          <ToolButton icon="download" onClick={() => exportCSV("hea-compliance", columns, rows)}>Export</ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load}>Refresh</ToolButton>
        </div>
        <DataTable
          rowKey="id"
          loading={loading}
          activeKey={selected?.id}
          onRowClick={(r) => setSel(r.id)}
          columns={columns}
          rows={pager.rows}
          emptyText="No institutions match the current filters."
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
