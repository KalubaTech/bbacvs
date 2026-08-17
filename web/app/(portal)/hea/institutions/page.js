"use client";

import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, Avatar, StatCard, StatRow, StatusTabs, SectionCard,
  SelectPill, SearchBox, ToolButton, DataTable, Pagination, usePager,
  Timeline, KV, ActionBtn, PanelHeader, Modal, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api, openBlob } from "../../../../lib/api";

const STATUS_LABEL = { pending: "Under Review", approved: "Approved", suspended: "Suspended" };
const STATUS_TONE = { pending: "amber", approved: "green", suspended: "red" };
const SECTOR_LABEL = { higher_ed: "Higher Education", university: "University", college: "College" };

const short = (v) => (v && v.length > 22 ? `${v.slice(0, 12)}…${v.slice(-6)}` : v || "—");

function DetailPanel({ inst, busy, onClose, onApprove, onReject, onReturn, onViewDoc, onSaveNote }) {
  const status = inst.heaStatus || "approved";
  const [note, setNote] = useState(inst.heaNote || "");
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
      <PanelHeader title="Institution Details" onClose={onClose} />

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

      <SectionCard title="History" className="mb-4" pad="p-4">
        <CaseTimeline events={inst.events} />
      </SectionCard>

      <div className="mb-4">
        <div className="mb-1.5 text-[12.5px] font-bold text-slate-900">Notes</div>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Internal note..."
          className="w-full rounded-lg border border-slate-200 p-2.5 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <ActionBtn
          tone="outline"
          className="mt-1.5"
          disabled={busy === inst.id}
          onClick={() => onSaveNote(inst, note)}
        >
          {busy === inst.id ? "Saving…" : "Save Note"}
        </ActionBtn>
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

const INPUT_CLS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100";
const EMPTY_REG = { institution: "", officerName: "", officerEmail: "", officerPassword: "", metamaskAddress: "" };

function RegisterModal({ open, onClose, onCreated, token }) {
  const [form, setForm] = useState(EMPTY_REG);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setSaving(true); setError(null);
    try {
      const body = { ...form };
      if (!body.metamaskAddress) delete body.metamaskAddress;
      await api.heaRegister(token, body);
      setForm(EMPTY_REG);
      await onCreated();
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  const fields = [
    { key: "institution", label: "Institution Name", placeholder: "e.g. University of Zambia" },
    { key: "officerName", label: "Officer Full Name", placeholder: "Jane Banda" },
    { key: "officerEmail", label: "Officer Email", placeholder: "officer@institution.ac.zm", type: "email" },
    { key: "officerPassword", label: "Officer Password", placeholder: "min 8 characters", type: "password" },
    { key: "metamaskAddress", label: "Wallet Address (optional)", placeholder: "0x…" },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Register New Institution"
      footer={
        <>
          <ActionBtn tone="outline" onClick={onClose}>Cancel</ActionBtn>
          <ActionBtn tone="navy" disabled={saving} onClick={save}>
            {saving ? "Registering…" : "Register Institution"}
          </ActionBtn>
        </>
      }
    >
      <p className="mb-3 text-[12px] text-slate-500">
        Registers a recognised higher-education institution as an approved issuer and creates its
        first institution-officer account.
      </p>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">{f.label}</label>
            <input
              className={INPUT_CLS}
              type={f.type || "text"}
              value={form[f.key]}
              onChange={set(f.key)}
              placeholder={f.placeholder}
            />
          </div>
        ))}
      </div>
      {error && <div className="mt-3 text-[12px] font-medium text-red-600">{error}</div>}
    </Modal>
  );
}

export default function HeaInstitutionsPage() {
  const { ready, token } = usePortalGuard(["hea"]);
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sel, setSel] = useState(undefined);
  const [registerOpen, setRegisterOpen] = useState(false);
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
  async function saveNote(inst, note) {
    setBusy(inst.id); setError(null);
    try { await api.heaSetStatus(token, inst.id, inst.heaStatus || "approved", note); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  async function viewDoc(id) {
    try { openBlob(await api.accreditationDoc(token, "hea", id)); }
    catch (err) { setError(err.message); }
  }


  const counts = institutions.reduce((m, i) => {
    const s = i.heaStatus || "approved";
    m[s] = (m[s] || 0) + 1;
    return m;
  }, {});
  const selfRegCount = institutions.filter((i) => i.selfRegistered).length;
  const sectors = [...new Set(institutions.map((i) => i.sector).filter(Boolean))];

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
    { label: "Under Review", count: counts.pending || 0 },
    { label: "Approved", count: counts.approved || 0 },
    { label: "Rejected / Suspended", count: counts.suspended || 0 },
  ];
  const TAB_STATUS = { "Under Review": "pending", Approved: "approved", "Rejected / Suspended": "suspended" };

  const rows = institutions.filter((r) => {
    const s = r.heaStatus || "approved";
    if (tab !== "All" && s !== TAB_STATUS[tab]) return false;
    if (statusFilter && s !== statusFilter) return false;
    if (sector && r.sector !== sector) return false;
    return !q || (r.institution + (r.sector || "")).toLowerCase().includes(q.toLowerCase());
  });
  const pager = usePager(rows, 10, [tab, q, sector, statusFilter]);
  if (!ready) return null;
  const selected = sel === null ? null : institutions.find((r) => r.id === sel) || rows[0] || null;

  const columns = [
    { key: "institution", label: "Institution Name", render: (r) => <span className="font-semibold text-slate-800">{r.institution}</span> },
    { key: "sector", label: "Type", csv: (r) => SECTOR_LABEL[r.sector] || r.sector || "", render: (r) => SECTOR_LABEL[r.sector] || r.sector || "—" },
    { key: "registration", label: "Registration", csv: (r) => (r.selfRegistered ? "Self-Registered" : "HEA Registered"), render: (r) => (r.selfRegistered ? "Self-Registered" : "HEA Registered") },
    {
      key: "status", label: "Application Status", csv: (r) => STATUS_LABEL[r.heaStatus] || r.heaStatus || "",
      render: (r) => <Badge tone={STATUS_TONE[r.heaStatus] || "slate"}>{STATUS_LABEL[r.heaStatus] || r.heaStatus || "—"}</Badge>,
    },
    { key: "submitted", label: "Submitted Date", csv: (r) => fmtDate(r.createdAt), render: (r) => fmtDate(r.createdAt) },
    { key: "approvedBy", label: "Approved By", csv: (r) => r.approvedBy || "", render: (r) => r.approvedBy || "—" },
    {
      key: "onChain", label: "On-Chain", csv: (r) => (r.onChain ? "Anchored" : "Pending"),
      render: (r) => <Badge tone={r.onChain ? "outline" : "amber"}>{r.onChain ? "Anchored" : "Pending"}</Badge>,
    },
  ];

  return (
    <PortalShell
      portal="hea"
      active="institutions"
      title="HEA Portal – Institution Registration & Accreditation"
      actions={
        <ActionBtn tone="navy" icon="plus" onClick={() => setRegisterOpen(true)}>
          Register New Institution
        </ActionBtn>
      }
      panel={
        selected ? (
          <DetailPanel
            key={selected.id}
            inst={selected}
            busy={busy}
            onClose={() => setSel(null)}
            onApprove={approve}
            onReject={reject}
            onReturn={returnForClarification}
            onViewDoc={viewDoc}
            onSaveNote={saveNote}
          />
        ) : (
          <div className="py-10 text-center text-[13px] text-slate-400">No institution selected.</div>
        )
      }
      panelKey={selected?.id}
      panelWidth="w-[400px]"
    >
      <StatRow cols={6}>
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </StatRow>

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs tabs={tabs} active={tab} onChange={setTab} />
        <ErrorBanner error={error} onRetry={load} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-64" placeholder="Search institutions..." value={q} onChange={setQ} />
          <SelectPill
            label="Type"
            value={sector}
            onChange={setSector}
            options={sectors.map((s) => ({ value: s, label: SECTOR_LABEL[s] || s }))}
          />
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
          <ToolButton icon="download" onClick={() => exportCSV("hea-institutions", columns, rows)}>Export</ToolButton>
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
      </div>

      <RegisterModal open={registerOpen} onClose={() => setRegisterOpen(false)} onCreated={load} token={token} />
    </PortalShell>
  );
}
