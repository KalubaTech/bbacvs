"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SelectPill, SearchBox,
  ToolButton, DataTable, Pagination, usePager, KVGrid, ActionBtn,
  PanelHeader, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { api, openBlob } from "../../../../lib/api";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";

const STATUS_LABEL = { pending: "Pending Review", approved: "Approved", suspended: "Suspended" };
const STATUS_TONE = { pending: "amber", approved: "green", suspended: "red" };

const short = (v) => (v && v.length > 22 ? `${v.slice(0, 12)}…${v.slice(-6)}` : v || "—");

function DetailPanel({ inst, busy, onClose, onApprove, onReject, onSuspend, onReinstate, onViewDoc }) {
  const status = inst.heaStatus || "approved";
  return (
    <div>
      <PanelHeader
        title="Institution Details"
        badge={<Badge tone={STATUS_TONE[status] || "slate"}>{STATUS_LABEL[status] || status}</Badge>}
        onClose={onClose}
      />

      <div className="mb-4 flex items-start gap-3">
        <Avatar name={inst.institution} size="h-11 w-11" />
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-slate-900">{inst.institution}</div>
          <div className="mt-0.5 text-[12px] text-slate-500">
            TEVET provider · {inst.selfRegistered ? "Self-registered" : "Registered by TEVETA"}
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <KVGrid
          cols={2}
          items={[
            { label: "DID", value: <span className="break-all font-mono text-[12px]">{short(inst.did)}</span> },
            { label: "Wallet", value: <span className="break-all font-mono text-[12px]">{short(inst.walletAddress)}</span> },
            { label: "Registered On", value: fmtDate(inst.createdAt) },
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
        action={<span className="text-[11px] font-semibold text-slate-500">{(inst.accreditedPrograms || []).length}</span>}
        className="mb-4"
        pad="p-3.5"
      >
        {(inst.accreditedPrograms || []).length === 0 ? (
          <div className="py-1 text-[12px] text-slate-400">No accredited programmes yet.</div>
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
              {busy === inst.id ? "Working…" : "Approve Institution"}
            </ActionBtn>
            <ActionBtn tone="softred" icon="x" full disabled={busy === inst.id} onClick={() => onReject(inst.id)}>
              Reject Application
            </ActionBtn>
          </>
        )}
        {status === "approved" && (
          <ActionBtn tone="softorange" icon="pause" full disabled={busy === inst.id} onClick={() => onSuspend(inst.id)}>
            {busy === inst.id ? "Working…" : "Suspend Institution"}
          </ActionBtn>
        )}
        {status === "suspended" && (
          <ActionBtn tone="softgreen" icon="check" full disabled={busy === inst.id} onClick={() => onReinstate(inst.id)}>
            {busy === inst.id ? "Working…" : "Reinstate Institution"}
          </ActionBtn>
        )}
      </div>
    </div>
  );
}

export default function TevetaDashboardPage() {
  const { ready, token } = usePortalGuard(["teveta"]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sel, setSel] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [pending, setPending] = useState([]);
  const [monitoring, setMonitoring] = useState(null);
  const [rplCount, setRplCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [all, pend, mon] = await Promise.all([
        api.tevetaInstitutions(token),
        api.tevetaPending(token),
        api.tevetaMonitoring(token),
      ]);
      setInstitutions(all.institutions || []);
      setPending(pend.pending || []);
      setMonitoring(mon);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // RPL count is informational — keep the dashboard usable if it fails.
    try {
      const rpl = await api.recognitionQueue(token);
      setRplCount((rpl.cases || []).length);
    } catch {
      setRplCount(null);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function approve(id) {
    setBusy(id);
    setError(null);
    try {
      const r = await api.tevetaApprove(token, id);
      if (r.warning) setError(r.warning);
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function reject(id) {
    const reason = prompt("Reason for rejection (optional):");
    if (reason === null) return;
    setBusy(id);
    setError(null);
    try { await api.tevetaReject(token, id, reason); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function suspend(id) {
    const note = prompt("Suspension note (required):");
    if (note === null) return;
    if (!note.trim()) { setError("A note is required to suspend an institution."); return; }
    setBusy(id);
    setError(null);
    try { await api.tevetaSetStatus(token, id, "suspended", note.trim()); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function reinstate(id) {
    const note = prompt("Reinstatement note (optional):");
    if (note === null) return;
    setBusy(id);
    setError(null);
    try { await api.tevetaSetStatus(token, id, "approved", note); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function viewDoc(id) {
    try { openBlob(await api.accreditationDoc(token, "teveta", id)); }
    catch (err) { setError(err.message); }
  }

  const counts = institutions.reduce((m, i) => {
    const s = i.heaStatus || "approved";
    m[s] = (m[s] || 0) + 1;
    return m;
  }, {});
  const credTotals = (monitoring?.summary || []).reduce(
    (m, s) => ({ total: m.total + (s.total || 0), active: m.active + (s.active || 0), revoked: m.revoked + (s.revoked || 0) }),
    { total: 0, active: 0, revoked: 0 }
  );

  const registryRows = institutions.filter((r) => {
    if (statusFilter && (r.heaStatus || "approved") !== statusFilter) return false;
    return !q || `${r.institution || ""} ${(r.accreditedPrograms || []).join(" ")}`.toLowerCase().includes(q.toLowerCase());
  });
  const pg = usePager(registryRows, 10, [q, statusFilter]);
  const selected = institutions.find((r) => String(r.id) === sel) || null;

  const csvCols = [
    { key: "institution", label: "Institution" },
    { key: "status", label: "Status", csv: (r) => STATUS_LABEL[r.heaStatus] || r.heaStatus || "approved" },
    { key: "origin", label: "Origin", csv: (r) => (r.selfRegistered ? "Self-registered" : "TEVETA-registered") },
    { key: "programmes", label: "Accredited Programmes", csv: (r) => (r.accreditedPrograms || []).join("; ") },
    { key: "onChain", label: "On-chain", csv: (r) => (r.onChain ? "Authorised" : "Pending") },
    { key: "createdAt", label: "Registered", csv: (r) => fmtDate(r.createdAt) },
  ];

  if (!ready) return null;

  return (
    <PortalShell
      portal="teveta"
      active="dashboard"
      title="TEVETA Portal – Regulatory Dashboard"
      panel={
        selected ? (
          <DetailPanel
            inst={selected}
            busy={busy}
            onClose={() => setSel(null)}
            onApprove={approve}
            onReject={reject}
            onSuspend={suspend}
            onReinstate={reinstate}
            onViewDoc={viewDoc}
          />
        ) : null
      }
      panelKey={selected?.id}
      panelWidth="w-[400px]"
    >
      <StatRow cols={6}>
        <StatCard icon="bank" iconTone="softblue" label="Registered Providers" value={String(institutions.length)} />
        <StatCard icon="clock" iconTone="amber" label="Pending Approval" value={String(pending.length)} />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Approved Providers" value={String(counts.approved || 0)} />
        <StatCard icon="pause" iconTone="softred" label="Suspended" value={String(counts.suspended || 0)} />
        <StatCard icon="file" iconTone="purple" label="TEVET Credentials" value={String(credTotals.total)} sub={`${credTotals.active} active · ${credTotals.revoked} revoked`} />
        <Link href="/teveta/rpl" className="block min-w-0">
          <StatCard
            icon="checkCircle"
            iconTone="orange"
            label="RPL Applications"
            value={rplCount == null ? "—" : String(rplCount)}
            className="h-full transition hover:border-orange-300"
          />
        </Link>
      </StatRow>

      <ErrorBanner error={error} onRetry={load} />

      <SectionCard
        title="Pending Provider Registrations"
        className="mb-5"
        action={<Badge tone={pending.length ? "amber" : "slate"}>{pending.length} awaiting review</Badge>}
        pad="p-0"
      >
        <DataTable
          rowKey="id"
          activeKey={selected?.id}
          onRowClick={(r) => setSel(String(r.id))}
          loading={loading}
          emptyText="No pending registrations."
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
            {
              key: "actions",
              label: "Actions",
              render: (r) => (
                <span className="flex items-center gap-2">
                  {r.hasAccreditationDoc && (
                    <ActionBtn
                      tone="outline"
                      icon="fileText"
                      className="!px-2.5 !py-1 text-[12px]"
                      onClick={(e) => { e.stopPropagation(); viewDoc(r.id); }}
                    >
                      Doc
                    </ActionBtn>
                  )}
                  <ActionBtn
                    tone="green"
                    icon="check"
                    className="!px-2.5 !py-1 text-[12px] disabled:opacity-50"
                    disabled={busy === r.id}
                    onClick={(e) => { e.stopPropagation(); approve(r.id); }}
                  >
                    {busy === r.id ? "Approving…" : "Approve"}
                  </ActionBtn>
                  <ActionBtn
                    tone="red"
                    icon="x"
                    className="!px-2.5 !py-1 text-[12px] disabled:opacity-50"
                    disabled={busy === r.id}
                    onClick={(e) => { e.stopPropagation(); reject(r.id); }}
                  >
                    Reject
                  </ActionBtn>
                </span>
              ),
            },
          ]}
          rows={pending}
        />
      </SectionCard>

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-4 shadow-card">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-72" placeholder="Search providers, programmes..." value={q} onChange={setQ} />
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
          <ToolButton icon="download" onClick={() => exportCSV("teveta-providers", csvCols, registryRows)}>
            Export
          </ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load} aria-label="Refresh" />
        </div>
        <DataTable
          rowKey="id"
          activeKey={selected?.id}
          onRowClick={(r) => setSel(String(r.id))}
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
                <Badge tone={STATUS_TONE[r.heaStatus] || "slate"}>{STATUS_LABEL[r.heaStatus] || r.heaStatus || "Approved"}</Badge>
              ),
            },
            { key: "createdAt", label: "Registered", render: (r) => fmtDate(r.createdAt) },
          ]}
          rows={pg.rows}
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>
    </PortalShell>
  );
}
