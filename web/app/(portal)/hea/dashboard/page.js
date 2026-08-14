"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, StatCard, StatRow, SectionCard, SearchBox,
  ToolButton, DataTable, Pagination, usePager, ActionBtn, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import { CHART, Donut, Legend, Bars } from "../../../../components/portal/charts";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const STATUS_LABEL = { pending: "Under Review", approved: "Approved", suspended: "Suspended" };
const STATUS_COLOR = { approved: CHART.green, pending: CHART.amber, suspended: CHART.red };
const SECTOR_LABEL = { higher_ed: "Higher Education", university: "University", college: "College" };
const CRED_TONE = { active: "green", pending: "amber", suspended: "orange", revoked: "red" };

const shortLabel = (s = "") => (s.length > 12 ? `${s.slice(0, 11)}…` : s || "—");

export default function HeaDashboardPage() {
  const { ready, token } = usePortalGuard(["hea"]);
  const [q, setQ] = useState("");
  const [institutions, setInstitutions] = useState([]);
  const [pending, setPending] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [monitoring, setMonitoring] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inst, pend, progs, mon] = await Promise.all([
        api.heaInstitutions(token),
        api.heaPending(token),
        api.pendingProgrammes(token),
        api.heaMonitoring(token),
      ]);
      setInstitutions(inst.institutions || []);
      setPending(pend.pending || []);
      setProgrammes(progs.programmes || []);
      setMonitoring(mon);
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

  if (!ready) return null;

  const statusCounts = institutions.reduce((m, i) => {
    const s = i.heaStatus || "approved";
    m[s] = (m[s] || 0) + 1;
    return m;
  }, {});
  const accreditedProgrammes = institutions.reduce((n, i) => n + (i.accreditedPrograms?.length || 0), 0);

  const summary = monitoring?.summary || [];
  const issuedTotal = summary.reduce((n, s) => n + (s.total || 0), 0);
  const kpis = [
    { icon: "bank", iconTone: "softblue", label: "Registered Institutions", value: String(institutions.length), sub: `${issuedTotal} credentials issued` },
    { icon: "clock", iconTone: "amber", label: "Pending Accreditation", value: String(pending.length) },
    { icon: "award", iconTone: "softgreen", label: "Accredited Programmes", value: String(accreditedProgrammes) },
    { icon: "alert", iconTone: "softred", label: "Suspended Institutions", value: String(statusCounts.suspended || 0) },
    { icon: "folder", iconTone: "purple", label: "Programmes In Review", value: String(programmes.length) },
  ];

  const statusDist = ["approved", "pending", "suspended"]
    .filter((s) => statusCounts[s])
    .map((s) => ({
      label: STATUS_LABEL[s],
      value: statusCounts[s],
      color: STATUS_COLOR[s],
      pct: institutions.length ? `${((statusCounts[s] / institutions.length) * 100).toFixed(1)}%` : "0%",
    }));

  const issuanceGroups = [...summary]
    .sort((a, b) => (b.total || 0) - (a.total || 0))
    .slice(0, 8)
    .map((s) => ({ label: shortLabel(s.institution), values: [s.active || 0, s.revoked || 0] }));

  const queueRows = pending.filter(
    (r) => !q || (r.institution + (r.sector || "")).toLowerCase().includes(q.toLowerCase())
  );
  const pager = usePager(queueRows, 10, [q]);

  const recent = (monitoring?.recent || []).slice(0, 8);

  const viewAll = (href, label = "View all →") => (
    <Link href={href} className="text-[12px] font-semibold text-blue-600 hover:underline">
      {label}
    </Link>
  );

  const queueColumns = [
    { key: "institution", label: "Institution", render: (r) => <span className="font-semibold text-slate-800">{r.institution}</span> },
    { key: "sector", label: "Type", csv: (r) => SECTOR_LABEL[r.sector] || r.sector || "", render: (r) => SECTOR_LABEL[r.sector] || r.sector || "—" },
    { key: "appType", label: "Application Type", csv: (r) => (r.selfRegistered ? "Self-Registration" : "HEA Registered"), render: (r) => (r.selfRegistered ? "Self-Registration" : "HEA Registered") },
    { key: "createdAt", label: "Submitted On", csv: (r) => fmtDate(r.createdAt), render: (r) => fmtDate(r.createdAt) },
    {
      key: "onChain", label: "On-Chain", csv: (r) => (r.onChain ? "Anchored" : "Pending"),
      render: (r) => <Badge tone={r.onChain ? "outline" : "amber"}>{r.onChain ? "Anchored" : "Pending"}</Badge>,
    },
    {
      key: "actions", label: "Decision", csv: () => "",
      render: (r) => (
        <span className="flex items-center gap-2">
          <ActionBtn
            tone="green"
            className="!px-2.5 !py-1 text-[12px]"
            disabled={busy === r.id}
            onClick={(e) => { e.stopPropagation(); approve(r.id); }}
          >
            {busy === r.id ? "Working…" : "Approve"}
          </ActionBtn>
          <ActionBtn
            tone="softred"
            className="!px-2.5 !py-1 text-[12px]"
            disabled={busy === r.id}
            onClick={(e) => { e.stopPropagation(); reject(r.id); }}
          >
            Reject
          </ActionBtn>
        </span>
      ),
    },
  ];

  return (
    <PortalShell
      portal="hea"
      active="dashboard"
      title="HEA Portal – Dashboard Overview"
      subtitle="Real-time overview of higher education regulation, accreditation, compliance and evidence shared with ZAQA."
    >
      <ErrorBanner error={error} onRetry={load} />

      <StatRow cols={5}>
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </StatRow>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Credential Issuance by Institution" action={viewAll("/hea/compliance", "View compliance →")}>
          {issuanceGroups.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">
              {loading ? "Loading…" : "No credentials issued yet."}
            </div>
          ) : (
            <>
              <Bars groups={issuanceGroups} colors={[CHART.green, CHART.red]} height={180} />
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                {[
                  { label: "Active", color: CHART.green },
                  { label: "Revoked", color: CHART.red },
                ].map((it) => (
                  <span key={it.label} className="flex items-center gap-2 text-[12px] text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: it.color }} />
                    {it.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </SectionCard>
        <SectionCard title="Accreditation Status Distribution" action={viewAll("/hea/institutions", "View all institutions →")}>
          {statusDist.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">
              {loading ? "Loading…" : "No records yet."}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <Donut
                size={160}
                thickness={22}
                centerTitle={String(institutions.length)}
                centerSub="Total"
                segments={statusDist.map((s) => ({ value: s.value, color: s.color, label: s.label }))}
              />
              <Legend
                className="min-w-[180px] flex-1"
                items={statusDist.map((s) => ({ label: s.label, color: s.color, value: `${s.value.toLocaleString()} (${s.pct})` }))}
              />
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            Institution Accreditation Queue
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{pending.length}</span>
          </span>
        }
        action={viewAll("/hea/institutions")}
        className="mb-5"
        pad="p-4"
      >
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-72" placeholder="Search pending institutions..." value={q} onChange={setQ} />
          <ToolButton icon="download" onClick={() => exportCSV("hea-accreditation-queue", queueColumns, queueRows)}>
            Export
          </ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load}>Refresh</ToolButton>
        </div>
        <DataTable
          rowKey="id"
          loading={loading}
          columns={queueColumns}
          rows={pager.rows}
          emptyText="No institutions awaiting accreditation."
          footer={<Pagination {...pager.props} className="border-t border-slate-100" />}
        />
      </SectionCard>

      <SectionCard title="Recent Credentials Issued" action={viewAll("/hea/evidence")} pad="p-4">
        <DataTable
          rowKey="credentialHash"
          loading={loading}
          columns={[
            { key: "subjectName", label: "Graduate", render: (r) => <span className="font-semibold text-slate-800">{r.subjectName || "—"}</span> },
            { key: "qualification", label: "Qualification", render: (r) => r.qualification || "—" },
            { key: "institution", label: "Institution", render: (r) => r.institution || "—" },
            { key: "zqfLevel", label: "NQF Level", render: (r) => r.zqfLevel || "—" },
            {
              key: "status", label: "Status",
              render: (r) => <Badge tone={CRED_TONE[r.status] || "slate"}>{r.status || "—"}</Badge>,
            },
            { key: "issuedAt", label: "Issued", render: (r) => fmtDate(r.issuedAt) },
          ]}
          rows={recent}
          emptyText="No credentials issued yet."
        />
      </SectionCard>
    </PortalShell>
  );
}
