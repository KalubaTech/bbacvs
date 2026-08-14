"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/portal/shell";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";
import {
  Badge, StatCard, StatRow, SectionCard, SearchBox, ToolButton,
  DataTable, Pagination, usePager, ActionBtn, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import { CHART, Donut, Legend } from "../../../../components/portal/charts";

// ZAQA validation state → label / badge tone / chart color.
const VMETA = {
  draft: { label: "Draft", tone: "slate", color: CHART.slate },
  pending: { label: "Pending", tone: "amber", color: CHART.amber },
  validated: { label: "Validated", tone: "green", color: CHART.green },
  rejected: { label: "Rejected", tone: "red", color: CHART.red },
  suspicious: { label: "Suspicious", tone: "orange", color: CHART.orange },
  suspended: { label: "Suspended", tone: "red", color: CHART.red },
  under_dispute: { label: "Under Dispute", tone: "purple", color: CHART.purple },
};
const SMETA = {
  active: { label: "Active", tone: "green" },
  pending: { label: "Pending", tone: "amber" },
  revoked: { label: "Revoked", tone: "red" },
  superseded: { label: "Superseded", tone: "slate" },
};

export default function EczDashboardPage() {
  const { ready, token } = usePortalGuard(["ecz"]);
  const [q, setQ] = useState("");
  const [creds, setCreds] = useState([]);
  const [pendingInst, setPendingInst] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, p, all, d] = await Promise.all([
        api.myIssued(token),
        api.eczPending(token),
        api.eczInstitutions(token),
        api.disputeQueue(token),
      ]);
      setCreds(c.credentials || []);
      setPendingInst(p.pending || []);
      setInstitutions(all.institutions || []);
      setDisputes(d.disputes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function onApprove(id) {
    setBusy(id);
    setError(null);
    try { await api.eczApprove(token, id); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function onReject(id) {
    const reason = prompt("Reason for rejection:");
    if (reason === null) return;
    setBusy(id);
    setError(null);
    try { await api.eczReject(token, id, reason); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  const learners = new Set(creds.map((c) => c.holderDID || c.holderNationalId || c.subjectName)).size;
  const validated = creds.filter((c) => c.zaqaValidation === "validated").length;
  const pendingZaqa = creds.filter((c) => c.zaqaValidation === "pending").length;
  const openDisputes = disputes.filter((d) => d.status !== "resolved").length;

  const rows = creds.filter(
    (r) =>
      !q ||
      ((r.credentialHash || "") + (r.holderNationalId || "") + (r.subjectName || "") + (r.qualification || ""))
        .toLowerCase()
        .includes(q.toLowerCase())
  );
  const pg = usePager(rows, 10, [q]);

  const statusCounts = {};
  for (const c of creds) {
    const k = c.zaqaValidation || "draft";
    statusCounts[k] = (statusCounts[k] || 0) + 1;
  }
  const segments = Object.entries(statusCounts).map(([k, v]) => ({
    label: VMETA[k]?.label || k, value: v, color: VMETA[k]?.color || CHART.slate,
  }));
  const legend = segments.map((s) => ({
    label: s.label, color: s.color,
    value: `${s.value} (${creds.length ? ((s.value / creds.length) * 100).toFixed(1) : 0}%)`,
  }));

  const csvCols = [
    { key: "credentialHash", label: "Credential Hash" },
    { key: "subjectName", label: "Learner" },
    { key: "holderNationalId", label: "NRC" },
    { key: "qualification", label: "Qualification" },
    { key: "status", label: "Status" },
    { key: "zaqaValidation", label: "ZAQA Validation", csv: (r) => r.zaqaValidation || "draft" },
    { key: "issuedAt", label: "Issued", csv: (r) => fmtDate(r.issuedAt) },
  ];

  if (!ready) return null;

  return (
    <PortalShell
      portal="ecz"
      active="dashboard"
      title="ECZ Portal – Dashboard Overview"
      subtitle="Live overview of ECZ-issued certificates, ZAQA validation and institution approvals."
    >
      <StatRow cols={6}>
        <StatCard icon="users" iconTone="softgreen" label="Learner Records" value={String(learners)} sub="Distinct certificate holders" />
        <StatCard icon="file" iconTone="softblue" label="Certificates Issued" value={String(creds.length)} sub="All ECZ-issued records" />
        <StatCard icon="shieldCheck" iconTone="softgreen" label="ZAQA Validated" value={String(validated)} sub={creds.length ? `${((validated / creds.length) * 100).toFixed(1)}% of certificates` : "No certificates yet"} />
        <StatCard icon="clock" iconTone="amber" label="Awaiting ZAQA" value={String(pendingZaqa)} sub="In national validation queue" />
        <StatCard icon="alert" iconTone="softred" label="Open Disputes" value={String(openDisputes)} sub="Routed to ECZ" />
        <StatCard icon="bank" iconTone="purple" label="Institutions" value={String(institutions.length)} sub={`${pendingInst.length} awaiting approval`} />
      </StatRow>

      <ErrorBanner error={error} onRetry={load} />

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard
          title="ZAQA Validation – Status Distribution"
          action={
            <Link href="/ecz/certificates" className="text-[12px] font-semibold text-emerald-700 hover:text-emerald-800">
              Open certificate register →
            </Link>
          }
        >
          {creds.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">No records yet.</div>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <Donut segments={segments} centerTitle={String(creds.length)} centerSub="Total" />
              <Legend items={legend} className="min-w-[180px] flex-1" />
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Pending Institution Approvals"
          action={<Badge tone={pendingInst.length ? "amber" : "slate"}>{pendingInst.length}</Badge>}
        >
          {pendingInst.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-slate-400">No pending approvals.</div>
          ) : (
            <div className="space-y-3">
              {pendingInst.map((inst) => (
                <div key={inst.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5">
                  <div className="min-w-0 leading-tight">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-slate-800">{inst.institution}</span>
                      {inst.selfRegistered && <Badge tone="blue">Self-registered</Badge>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      Registered: {fmtDate(inst.createdAt)} · Sector: {inst.sector || "secondary"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ActionBtn tone="darkgreen" disabled={busy === inst.id} onClick={() => onApprove(inst.id)}>
                      {busy === inst.id ? "Working…" : "Approve"}
                    </ActionBtn>
                    <ActionBtn tone="softred" disabled={busy === inst.id} onClick={() => onReject(inst.id)}>
                      Reject
                    </ActionBtn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Recently Issued Certificates</h3>
          <Badge tone="green">{creds.length}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-full sm:w-80" placeholder="Search by learner, NRC, qualification, hash..." value={q} onChange={setQ} />
          <div className="ml-auto flex items-center gap-2.5">
            <ToolButton icon="download" onClick={() => exportCSV("ecz-certificates", csvCols, rows)}>Export</ToolButton>
            <ToolButton icon="refresh" onClick={load} aria-label="Refresh" />
          </div>
        </div>
        <DataTable
          rowKey="credentialHash"
          loading={loading}
          emptyText="No certificates issued yet."
          columns={[
            {
              key: "credentialHash", label: "Credential",
              render: (r) => <span className="font-semibold text-emerald-700">{r.credentialHash?.slice(0, 12)}…</span>,
            },
            {
              key: "nrc", label: "NRC / Learner",
              render: (r) => (
                <span className="block leading-tight">
                  <span className="block font-semibold text-slate-800">{r.holderNationalId || "—"}</span>
                  <span className="block text-[11px] text-slate-400">{r.subjectName}</span>
                </span>
              ),
            },
            { key: "qualification", label: "Qualification" },
            {
              key: "status", label: "Status",
              render: (r) => <Badge tone={SMETA[r.status]?.tone || "slate"}>{SMETA[r.status]?.label || r.status}</Badge>,
            },
            {
              key: "zaqaValidation", label: "ZAQA Status",
              render: (r) => {
                const m = VMETA[r.zaqaValidation || "draft"] || VMETA.draft;
                return <Badge tone={m.tone}>{m.label}</Badge>;
              },
            },
            { key: "issuedAt", label: "Issued On", render: (r) => fmtDate(r.issuedAt) },
            {
              key: "action", label: "Action",
              render: (r) => (
                <Link
                  href={`/verify?hash=${r.credentialHash}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[12px] font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  Verify
                </Link>
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
