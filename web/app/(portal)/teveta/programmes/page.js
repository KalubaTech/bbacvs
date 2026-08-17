"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SearchBox, SelectPill,
  ToolButton, DataTable, Pagination, usePager, KVGrid, ActionBtn,
  PanelHeader, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { api, openBlob } from "../../../../lib/api";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";

const STATUS_TONES = { approved: "green", pending: "amber", suspended: "red" };
const STATUS_LABELS = { approved: "Approved", pending: "Pending Review", suspended: "Suspended" };

function ProgrammePanel({ prog, busy, onClose, onApprove, onReject }) {
  return (
    <div>
      <PanelHeader
        title="Programme Application"
        badge={<Badge tone="amber">Pending</Badge>}
        onClose={onClose}
      />
      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <KVGrid
          cols={2}
          items={[
            { label: "Programme", value: prog.name },
            { label: "Institution", value: prog.institution || "—" },
            { label: "NQF Level", value: prog.zqfLevel != null ? `Level ${prog.zqfLevel}` : "—" },
            { label: "Qualification Ref", value: prog.qualificationRef || "—" },
            { label: "Submitted", value: fmtDate(prog.createdAt) },
            { label: "Status", value: <Badge tone="amber">Pending accreditation</Badge> },
          ]}
        />
        {prog.note ? (
          <div className="mt-3 border-t border-slate-100 pt-2.5">
            <div className="text-[11px] font-medium text-slate-400">Note</div>
            <div className="mt-0.5 text-[12.5px] text-slate-700">{prog.note}</div>
          </div>
        ) : null}
      </div>

      <SectionCard title="Case History" className="mb-4" pad="p-4">
        <CaseTimeline events={prog.events} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <ActionBtn tone="green" icon="check" full disabled={busy === prog.id} onClick={() => onApprove(prog.id)}>
          {busy === prog.id ? "Working…" : "Accredit Programme"}
        </ActionBtn>
        <ActionBtn tone="softred" icon="x" full disabled={busy === prog.id} onClick={() => onReject(prog.id)}>
          Reject
        </ActionBtn>
      </div>
    </div>
  );
}

function ProviderPanel({ inst, busy, onClose, onApprove, onReject, onViewDoc }) {
  const status = inst.heaStatus || "approved";
  const programmes = inst.accreditedPrograms || [];
  return (
    <div>
      <PanelHeader
        title="Provider Details"
        badge={<Badge tone={STATUS_TONES[status] || "slate"}>{STATUS_LABELS[status] || status}</Badge>}
        onClose={onClose}
      />

      <div className="mb-3 flex items-start gap-3">
        <Avatar name={inst.institution} size="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-slate-900">{inst.institution}</div>
          <div className="mt-0.5 text-[11.5px] text-slate-500">
            TEVET provider · {inst.selfRegistered ? "Self-registered" : "Registered by TEVETA"}
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <KVGrid
          cols={2}
          items={[
            { label: "Submitted Date", value: fmtDate(inst.createdAt) },
            { label: "Approved By", value: inst.approvedBy || "—" },
            {
              label: "On-chain",
              value: inst.onChain ? <Badge tone="green">Authorised</Badge> : <Badge tone="amber">Pending</Badge>,
            },
            { label: "ZAQA Trusted", value: inst.zaqaTrusted ? "Yes" : "No" },
          ]}
        />
        {inst.heaNote ? (
          <div className="mt-3 border-t border-slate-100 pt-2.5">
            <div className="text-[11px] font-medium text-slate-400">Regulator Note</div>
            <div className="mt-0.5 text-[12.5px] text-slate-700">{inst.heaNote}</div>
          </div>
        ) : null}
      </div>

      <SectionCard
        title="Accredited Programmes"
        action={<Badge tone="orange">{programmes.length}</Badge>}
        className="mb-4"
        pad="p-3.5"
      >
        {programmes.length === 0 ? (
          <p className="text-[11.5px] leading-relaxed text-slate-500">No accredited programmes recorded yet.</p>
        ) : (
          <ul className="space-y-1">
            {programmes.map((p) => (
              <li key={p} className="flex items-start gap-2 text-[12.5px] text-slate-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                {p}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Case History" className="mb-4" pad="p-4">
        <CaseTimeline events={inst.events} />
      </SectionCard>

      <div className="space-y-2.5">
        {inst.hasAccreditationDoc && (
          <ActionBtn tone="outline" icon="fileText" full onClick={() => onViewDoc(inst.id)}>
            View Accreditation Document
          </ActionBtn>
        )}
        {status === "pending" && (
          <>
            <ActionBtn tone="green" icon="check" full disabled={busy === inst.id} onClick={() => onApprove(inst.id)}>
              {busy === inst.id ? "Working…" : "Approve Provider"}
            </ActionBtn>
            <ActionBtn tone="softred" icon="x" full disabled={busy === inst.id} onClick={() => onReject(inst.id)}>
              Reject Application
            </ActionBtn>
          </>
        )}
      </div>
    </div>
  );
}

export default function TevetaProgrammesPage() {
  const { ready, token } = usePortalGuard(["teveta"]);
  const [insts, setInsts] = useState([]);
  const [progs, setProgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sel, setSel] = useState(null); // { type: "programme" | "provider", id }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [all, pend, pp] = await Promise.all([
        api.tevetaInstitutions(token),
        api.tevetaPending(token),
        api.pendingProgrammes(token),
      ]);
      const byId = new Map();
      for (const i of [...(pend.pending || []), ...(all.institutions || [])]) {
        if (!byId.has(String(i.id))) byId.set(String(i.id), i);
      }
      setInsts([...byId.values()]);
      setProgs(pp.programmes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function approveProgramme(id) {
    setBusy(id);
    setError(null);
    try { await api.approveProgramme(token, id); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function rejectProgramme(id) {
    const reason = prompt("Reason for rejecting this programme (optional):");
    if (reason === null) return;
    setBusy(id);
    setError(null);
    try { await api.rejectProgramme(token, id, reason); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function approveProvider(id) {
    setBusy(id);
    setError(null);
    try {
      const r = await api.tevetaApprove(token, id);
      if (r.warning) setError(r.warning);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function rejectProvider(id) {
    const reason = prompt("Reason for rejection (optional):");
    if (reason === null) return;
    setBusy(id);
    setError(null);
    try { await api.tevetaReject(token, id, reason); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function viewDoc(id) {
    try { openBlob(await api.accreditationDoc(token, "teveta", id)); }
    catch (err) { setError(err.message); }
  }

  const providerRows = insts.filter((r) => {
    if (statusFilter && (r.heaStatus || "approved") !== statusFilter) return false;
    return (
      !q ||
      `${r.institution || ""} ${(r.accreditedPrograms || []).join(" ")}`.toLowerCase().includes(q.toLowerCase())
    );
  });
  const pg = usePager(providerRows, 10, [q, statusFilter]);

  const selectedProg = sel?.type === "programme" ? progs.find((p) => String(p.id) === sel.id) || null : null;
  const selectedInst = sel?.type === "provider" ? insts.find((i) => String(i.id) === sel.id) || null : null;

  const counts = {
    pending: insts.filter((i) => i.heaStatus === "pending").length,
    approved: insts.filter((i) => i.heaStatus === "approved").length,
    suspended: insts.filter((i) => i.heaStatus === "suspended").length,
    onChain: insts.filter((i) => i.onChain).length,
  };

  const csvCols = [
    { key: "institution", label: "Provider" },
    { key: "programmes", label: "Accredited Programmes", csv: (r) => (r.accreditedPrograms || []).join("; ") },
    { key: "status", label: "Status", csv: (r) => STATUS_LABELS[r.heaStatus] || r.heaStatus || "approved" },
    { key: "origin", label: "Origin", csv: (r) => (r.selfRegistered ? "Self-registered" : "TEVETA-registered") },
    { key: "onChain", label: "On-chain", csv: (r) => (r.onChain ? "Authorised" : "Pending") },
    { key: "createdAt", label: "Submitted", csv: (r) => fmtDate(r.createdAt) },
  ];

  if (!ready) return null;

  return (
    <PortalShell
      portal="teveta"
      active="programmes"
      title="TEVETA Portal – Programme Accreditation"
      panel={
        selectedProg ? (
          <ProgrammePanel
            prog={selectedProg}
            busy={busy}
            onClose={() => setSel(null)}
            onApprove={approveProgramme}
            onReject={rejectProgramme}
          />
        ) : selectedInst ? (
          <ProviderPanel
            inst={selectedInst}
            busy={busy}
            onClose={() => setSel(null)}
            onApprove={approveProvider}
            onReject={rejectProvider}
            onViewDoc={viewDoc}
          />
        ) : null
      }
      panelKey={sel ? `${sel.type}-${sel.id}` : null}
      panelWidth="w-[420px]"
    >
      <StatRow cols={5}>
        <StatCard icon="clipboard" iconTone="orange" label="Programme Applications" value={String(progs.length)} sub="Awaiting accreditation" />
        <StatCard icon="bank" iconTone="softblue" label="Registered Providers" value={String(insts.length)} sub="TEVET institution registry" />
        <StatCard icon="clock" iconTone="amber" label="Providers Pending" value={String(counts.pending)} sub="Awaiting TEVETA decision" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Approved Providers" value={String(counts.approved)} sub="Accredited to issue" />
        <StatCard icon="shieldCheck" iconTone="purple" label="On-chain Authorised" value={String(counts.onChain)} sub="GovernanceSafe authorised" />
      </StatRow>

      <ErrorBanner error={error} onRetry={load} />

      <SectionCard
        title="Pending Programme Applications"
        className="mb-5"
        action={<Badge tone={progs.length ? "amber" : "slate"}>{progs.length} awaiting review</Badge>}
        pad="p-0"
      >
        <DataTable
          rowKey="id"
          activeKey={selectedProg?.id}
          onRowClick={(r) => setSel({ type: "programme", id: String(r.id) })}
          loading={loading}
          emptyText="No programme applications awaiting accreditation."
          columns={[
            { key: "name", label: "Programme", render: (r) => <span className="font-semibold text-slate-800">{r.name}</span> },
            { key: "institution", label: "Provider", render: (r) => r.institution || "—" },
            { key: "zqfLevel", label: "NQF Level", render: (r) => (r.zqfLevel != null ? <Badge tone="blue">Level {r.zqfLevel}</Badge> : "—") },
            { key: "qualificationRef", label: "Qualification Ref", render: (r) => r.qualificationRef || "—" },
            { key: "createdAt", label: "Submitted", render: (r) => fmtDate(r.createdAt) },
            {
              key: "actions",
              label: "Actions",
              render: (r) => (
                <span className="flex items-center gap-2">
                  <ActionBtn
                    tone="green"
                    icon="check"
                    className="!px-2.5 !py-1 text-[12px] disabled:opacity-50"
                    disabled={busy === r.id}
                    onClick={(e) => { e.stopPropagation(); approveProgramme(r.id); }}
                  >
                    {busy === r.id ? "Working…" : "Accredit"}
                  </ActionBtn>
                  <ActionBtn
                    tone="red"
                    icon="x"
                    className="!px-2.5 !py-1 text-[12px] disabled:opacity-50"
                    disabled={busy === r.id}
                    onClick={(e) => { e.stopPropagation(); rejectProgramme(r.id); }}
                  >
                    Reject
                  </ActionBtn>
                </span>
              ),
            },
          ]}
          rows={progs}
        />
      </SectionCard>

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-4 shadow-card">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-72" placeholder="Search by provider or programme..." value={q} onChange={setQ} />
          <SelectPill
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "pending", label: "Pending Review" },
              { value: "approved", label: "Approved" },
              { value: "suspended", label: "Suspended" },
            ]}
          />
          <ToolButton icon="download" onClick={() => exportCSV("teveta-programme-accreditation", csvCols, providerRows)}>
            Export
          </ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load} aria-label="Refresh" />
        </div>
        <DataTable
          rowKey="id"
          activeKey={selectedInst?.id}
          onRowClick={(r) => setSel({ type: "provider", id: String(r.id) })}
          loading={loading}
          emptyText="No providers registered yet."
          columns={[
            { key: "institution", label: "Provider", render: (r) => <span className="font-semibold text-slate-800">{r.institution}</span> },
            {
              key: "programmes",
              label: "Accredited Programmes",
              render: (r) => (
                <span className="block max-w-[260px] truncate">{(r.accreditedPrograms || []).join(", ") || "—"}</span>
              ),
            },
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
            {
              key: "onChain",
              label: "On-chain",
              render: (r) =>
                r.onChain ? <Badge tone="green" icon="check">Authorised</Badge> : <Badge tone="amber" icon="clock">Pending</Badge>,
            },
            {
              key: "heaStatus",
              label: "Status",
              render: (r) => (
                <Badge tone={STATUS_TONES[r.heaStatus] || "slate"}>{STATUS_LABELS[r.heaStatus] || r.heaStatus || "Approved"}</Badge>
              ),
            },
          ]}
          rows={pg.rows}
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>
    </PortalShell>
  );
}
