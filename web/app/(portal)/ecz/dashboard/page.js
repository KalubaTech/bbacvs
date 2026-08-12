"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";
import {
  Badge, StatCard, StatRow, SectionCard, SelectPill, SearchBox, ToolButton,
  DataTable, Pagination, ActionBtn,
} from "../../../../components/portal/kit";
import { CHART, LineChart, Donut, Legend } from "../../../../components/portal/charts";

const SYNC_LABELS = ["May 14", "May 15", "May 16", "May 17", "May 18", "May 19", "May 20"];
const SYNC_POINTS = [12000, 22000, 18000, 30000, 22000, 28000, 40000];

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
};

const ALERTS = [
  {
    tone: "red", tag: "High Priority", sla: "SLA 01:28:44", slaTone: "text-red-500",
    title: "Result Discrepancy – Urgent", lines: ["Mulenga, Chansa", "NRC: 123456/10/1 · GCE Advanced Level", "Requested: May 19, 2025"],
    btn: "View Case",
  },
  {
    tone: "amber", tag: "Overdue Action", sla: "SLA Overdue", slaTone: "text-amber-600",
    title: "Information Request Overdue", lines: ["Mwale, Kelvin", "NRC: 543210/55/1 · GCE Advanced Level", "Due since: May 18, 2025"],
    btn: "Send Reminder",
  },
  {
    tone: "red", tag: "Data Issue", sla: "Records Affected: 27", slaTone: "text-red-500",
    title: "Bulk Result Import – Errors Detected", lines: ["April 2025 Import Batch", "GCE Ordinary Level · Multiple Subjects", "Detected: May 20, 2025"],
    btn: "View Details",
  },
  {
    tone: "amber", tag: "Pending Evidence", sla: "SLA 03:12:15", slaTone: "text-amber-600",
    title: "Evidence Awaiting Upload", lines: ["Phiri, Beatrice", "NRC: 987654/32/1 · Diploma in Education", "Requested: May 17, 2025"],
    btn: "Upload Evidence",
  },
];

function AlertsPanel() {
  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold text-slate-900">Integration Alerts &amp; Escalations</h2>
          <Badge tone="red">6</Badge>
        </div>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>
      <SelectPill label="All Alerts" className="mb-4 w-full justify-between" />
      <div className="space-y-3">
        {ALERTS.map((a, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                <span className={`h-2 w-2 rounded-full ${a.tone === "red" ? "bg-red-500" : "bg-amber-500"}`} />
                {a.tag}
              </span>
              <span className={`text-[11px] font-semibold ${a.slaTone}`}>{a.sla}</span>
            </div>
            <div className="mt-1.5 text-[13px] font-bold text-slate-900">{a.title}</div>
            <div className="mt-1 space-y-0.5">
              {a.lines.map((l, j) => (
                <div key={j} className={`text-[12px] ${j === 0 ? "font-medium text-slate-700" : "text-slate-500"}`}>{l}</div>
              ))}
            </div>
            <ActionBtn tone="outline" full className="mt-2.5">{a.btn}</ActionBtn>
          </div>
        ))}
      </div>
      <button className="mt-4 flex w-full items-center justify-center gap-1 text-[12px] font-semibold text-emerald-700 hover:text-emerald-800">
        View all alerts →
      </button>
    </div>
  );
}

export default function EczDashboardPage() {
  const { ready, user, token } = usePortalGuard(["ecz"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [creds, setCreds] = useState([]);
  const [pendingInst, setPendingInst] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const [c, p, d] = await Promise.all([
        api.myIssued(token),
        api.eczPending(token),
        api.disputeQueue(token),
      ]);
      setCreds(c.credentials || []);
      setPendingInst(p.pending || []);
      setDisputes(d.disputes || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function onApprove(id) {
    setBusy(id);
    try { await api.eczApprove(token, id); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function onReject(id) {
    const reason = prompt("Reason for rejection:");
    if (reason === null) return;
    setBusy(id);
    try { await api.eczReject(token, id, reason); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  if (!ready) return null;

  const learners = new Set(creds.map((c) => c.holderDID || c.subjectName)).size;
  const validated = creds.filter((c) => c.zaqaValidation === "validated").length;
  const pendingZaqa = creds.filter((c) => c.zaqaValidation === "pending").length;
  const openDisputes = disputes.filter((d) => d.status !== "resolved").length;

  const rows = creds.filter(
    (r) => !q ||
      ((r.credentialHash || "") + (r.holderNationalId || "") + (r.subjectName || "") + (r.qualification || ""))
        .toLowerCase().includes(q.toLowerCase())
  );

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

  return (
    <PortalShell
      portal="ecz"
      active="dashboard"
      title="ECZ Portal – Dashboard Overview"
      subtitle="Real-time overview of credential data quality and ZAQA integration for BBACVS."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={
        <>
          <ActionBtn tone="darkgreen" icon="plus">New ZAQA Request</ActionBtn>
          <SelectPill label="May 14 – May 20, 2025" />
        </>
      }
      panel={<AlertsPanel />}
      panelWidth="w-[380px]"
    >
      <StatRow cols={6}>
        <StatCard icon="users" iconTone="softgreen" label="Total Learner Records" value={learners} sub="Distinct certificate holders" />
        <StatCard icon="refresh" iconTone="softgreen" label="ZAQA Validated" value={validated} sub={creds.length ? `${((validated / creds.length) * 100).toFixed(1)}% of certificates` : "No certificates yet"} />
        <StatCard icon="clock" iconTone="amber" label="Pending ZAQA Requests" value={pendingZaqa} sub="Awaiting national validation" />
        <StatCard icon="file" iconTone="softblue" label="Certificates Issued" value={creds.length} sub="All ECZ-issued records" />
        <StatCard icon="alert" iconTone="softred" label="Open Disputes" value={openDisputes} sub="Routed to ECZ" />
        <StatCard icon="bolt" iconTone="softgreen" label="Pending Institutions" value={pendingInst.length} sub="Awaiting ECZ approval" />
      </StatRow>

      {error && <div className="mb-3 text-[13px] font-medium text-red-600">{error}</div>}

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Records Synchronized Over Time" action={<SelectPill label="Day" />}>
          <LineChart
            series={[{ points: SYNC_POINTS, color: CHART.green, label: "Records Synced", area: true }]}
            labels={SYNC_LABELS}
            height={190}
          />
        </SectionCard>
        <SectionCard
          title="ZAQA Verification Requests – Status Distribution"
          action={
            <button className="text-[12px] font-semibold text-emerald-700 hover:text-emerald-800">
              View full breakdown →
            </button>
          }
        >
          {creds.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">No records yet.</div>
          ) : (
            <div className="flex items-center gap-6">
              <Donut segments={segments} centerTitle={String(creds.length)} centerSub="Total" />
              <Legend items={legend} className="flex-1" />
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">ZAQA Verification Queue</h3>
          <Badge tone="green">{creds.length}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-80" placeholder="Search requests, NRC, names..." value={q} onChange={setQ} />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
          <ToolButton icon="refresh" onClick={load} />
        </div>
        <DataTable
          rowKey="credentialHash"
          activeKey={sel}
          onRowClick={(r) => setSel(r.credentialHash)}
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
              key: "type", label: "Type",
              render: (r) => <span>{r.credentialType || "—"}{r.zqfLevel ? ` · ZQF ${r.zqfLevel}` : ""}</span>,
            },
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
                <span className="flex items-center gap-2">
                  <Link
                    href={`/verify?hash=${r.credentialHash}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[12px] font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    View
                  </Link>
                  <Icon name="dots" className="h-4 w-4 text-slate-400" />
                </span>
              ),
            },
          ]}
          rows={rows}
          footer={
            rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-slate-400">No records yet.</div>
            ) : null
          }
        />
        <Pagination summary={`Showing ${rows.length} of ${creds.length} records`} page={1} pages={1} />
      </div>

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
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-slate-800">{inst.institution}</span>
                    {inst.selfRegistered && <Badge tone="blue">Self-registered</Badge>}
                    {inst.hasAccreditationDoc && <Badge tone="slate">Has accreditation doc</Badge>}
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
    </PortalShell>
  );
}
