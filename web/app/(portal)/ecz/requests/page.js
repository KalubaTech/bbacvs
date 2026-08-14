"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/portal/shell";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";
import {
  Badge, StatCard, StatRow, SearchBox, ToolButton, DataTable, Pagination,
  usePager, ActionBtn, KVGrid, WorkflowSteps, PanelHeader, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";

// The full disputes workspace (review workflow, decisions, appeals) lives at
// /ecz/disputes — this page is the lighter verification-requests view of the
// same ECZ-routed queue.

const STATUS_META = {
  open: { label: "Open", tone: "green" },
  under_review: { label: "Under Review", tone: "amber" },
  awaiting_evidence: { label: "Awaiting Evidence", tone: "orange" },
  upheld: { label: "Upheld", tone: "green" },
  dismissed: { label: "Dismissed", tone: "slate" },
  resolved: { label: "Resolved", tone: "slate" },
  appealed: { label: "Appealed", tone: "purple" },
};

const catLabel = (c) => (c ? c.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()) : "—");
const isClosed = (s) => ["resolved", "upheld", "dismissed"].includes(s);

function Section({ n, title, children }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10.5px] font-bold text-emerald-700">
          {n}
        </span>
        <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
      </div>
      <div className="rounded-xl border border-slate-200 p-3.5">{children}</div>
    </div>
  );
}

function DetailPanel({ req, busy, onClose, onResolve }) {
  const st = STATUS_META[req.status] || { label: req.status, tone: "slate" };
  return (
    <div>
      <PanelHeader
        title={String(req.id).slice(-10).toUpperCase()}
        badge={<Badge tone={st.tone} dot>{st.label}</Badge>}
        onClose={onClose}
      />

      <Section n={1} title="Learner Information">
        <KVGrid
          cols={2}
          items={[
            { label: "Name", value: req.subjectName || "—" },
            { label: "Institution", value: req.institution || "—" },
            { label: "Opened By", value: req.openedBy || "—" },
            { label: "Lead Authority", value: (req.leadAuthority || "").toUpperCase() || "—" },
          ]}
        />
      </Section>

      <Section n={2} title="Linked Record">
        <KVGrid
          cols={1}
          items={[{ label: "Credential Hash", value: <span className="break-all">{req.credentialHash}</span> }]}
        />
      </Section>

      <Section n={3} title="Request Summary">
        <KVGrid
          cols={2}
          items={[
            { label: "Issue Type", value: catLabel(req.category) },
            { label: "Request Date", value: fmtDate(req.createdAt) },
          ]}
        />
        <div className="mt-3">
          <div className="text-[11px] font-medium text-slate-400">Details</div>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">{req.description}</p>
        </div>
        {req.resolution && (
          <div className="mt-3">
            <div className="text-[11px] font-medium text-slate-400">Resolution</div>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">{req.resolution}</p>
          </div>
        )}
      </Section>

      <Section n={4} title={`Communication Log (${(req.events || []).length})`}>
        <div className="space-y-2.5">
          {(req.events || []).map((c, i) => (
            <div key={i} className="flex items-start justify-between gap-2">
              <div className="min-w-0 leading-tight">
                <div className="text-[12.5px] font-medium text-slate-700">
                  {c.action === "opened" ? "Dispute opened" : c.action === "resolved" ? "Dispute resolved" : catLabel(c.action)}
                  {c.note ? ` — ${c.note}` : ""}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(c.at)}</div>
              </div>
              <Badge tone={c.action === "resolved" ? "green" : "slate"}>{c.actor}</Badge>
            </div>
          ))}
          {(req.events || []).length === 0 && (
            <div className="py-2 text-center text-[12px] text-slate-400">No events yet.</div>
          )}
        </div>
      </Section>

      <Section n={5} title="Workflow Timeline">
        <WorkflowSteps
          steps={[
            { label: "Received", sub: fmtDate(req.createdAt), state: "done" },
            { label: "Under Review", state: isClosed(req.status) ? "done" : "current" },
            { label: "Resolved", state: isClosed(req.status) ? "done" : "pending" },
          ]}
        />
      </Section>

      <div className="flex flex-wrap gap-2">
        {!isClosed(req.status) && (
          <ActionBtn tone="softgreen" icon="check" disabled={busy === req.id} onClick={() => onResolve(req.id)}>
            {busy === req.id ? "Resolving…" : "Resolve"}
          </ActionBtn>
        )}
        <Link
          href="/ecz/disputes"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Open in Disputes Workspace
        </Link>
      </div>
    </div>
  );
}

export default function EczRequestsPage() {
  const { ready, token } = usePortalGuard(["ecz"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.disputeQueue(token);
      setDisputes(res.disputes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function onResolve(id) {
    const resolution = prompt("Resolution note:");
    if (!resolution) return;
    setBusy(id);
    setError(null);
    try { await api.resolveDispute(token, id, resolution); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  const rows = disputes.filter(
    (r) =>
      !q ||
      (String(r.id) + (r.subjectName || "") + (r.institution || "") + (r.category || "") + (r.credentialHash || ""))
        .toLowerCase()
        .includes(q.toLowerCase())
  );
  const pg = usePager(rows, 10, [q]);
  const selected = disputes.find((d) => d.id === sel) || null;

  const open = disputes.filter((d) => !isClosed(d.status)).length;
  const resolved = disputes.length - open;
  const categories = new Set(disputes.map((d) => d.category)).size;
  const turnarounds = disputes
    .filter((d) => isClosed(d.status))
    .map((d) => {
      const done = (d.events || []).find((e) => ["resolved", "decided"].includes(e.action));
      return done ? (new Date(done.at) - new Date(d.createdAt)) / 86400000 : null;
    })
    .filter((v) => v != null);
  const avgDays = turnarounds.length
    ? `${(turnarounds.reduce((s, v) => s + v, 0) / turnarounds.length).toFixed(1)} days`
    : "—";

  const csvCols = [
    { key: "id", label: "Request ID", csv: (r) => String(r.id) },
    { key: "subjectName", label: "Learner", csv: (r) => r.subjectName || "" },
    { key: "credentialHash", label: "Credential Hash" },
    { key: "institution", label: "Institution", csv: (r) => r.institution || "" },
    { key: "category", label: "Issue Type", csv: (r) => catLabel(r.category) },
    { key: "openedBy", label: "Opened By", csv: (r) => r.openedBy || "" },
    { key: "status", label: "Status", csv: (r) => (STATUS_META[r.status] || { label: r.status }).label },
    { key: "createdAt", label: "Requested", csv: (r) => fmtDate(r.createdAt) },
  ];

  if (!ready) return null;

  return (
    <PortalShell
      portal="ecz"
      active="requests"
      title="ECZ Portal – ZAQA Verification Requests"
      subtitle="Verification requests and corrections routed to ECZ through BBACVS. Full casework lives in Disputes & Corrections."
      actions={
        <ToolButton icon="download" onClick={() => exportCSV("ecz-verification-requests", csvCols, rows)}>
          Export Queue
        </ToolButton>
      }
      panel={selected ? <DetailPanel req={selected} busy={busy} onClose={() => setSel(null)} onResolve={onResolve} /> : null}
      panelKey={selected?.id}
      panelWidth="w-[400px]"
    >
      <StatRow cols={5}>
        <StatCard icon="inbox" iconTone="softgreen" label="Open Requests" value={String(open)} sub="Awaiting ECZ action" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Closed Cases" value={String(resolved)} sub="Resolved / decided" />
        <StatCard icon="help" iconTone="amber" label="Total Cases" value={String(disputes.length)} sub="Routed to ECZ" />
        <StatCard icon="alert" iconTone="softred" label="Issue Categories" value={String(categories)} sub="Distinct dispute types" />
        <StatCard icon="clock" iconTone="softblue" label="Average Turnaround" value={avgDays} sub="Open to resolution" />
      </StatRow>

      <ErrorBanner error={error} onRetry={load} />

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Verification Requests Queue</h3>
          <Badge tone="green">{open}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-full sm:w-96" placeholder="Search by ID, name, institution, category..." value={q} onChange={setQ} />
          <ToolButton icon="refresh" className="ml-auto" onClick={load}>Refresh</ToolButton>
        </div>
        <DataTable
          rowKey="id"
          activeKey={selected?.id}
          onRowClick={(r) => setSel(r.id)}
          loading={loading}
          emptyText="No verification requests yet."
          columns={[
            {
              key: "id", label: "Request ID",
              render: (r) => <span className="font-semibold text-emerald-700">{String(r.id).slice(-10).toUpperCase()}</span>,
            },
            {
              key: "learner", label: "Learner / Credential",
              render: (r) => (
                <span className="block leading-tight">
                  <span className="block font-semibold text-slate-800">{r.subjectName || "—"}</span>
                  <span className="block text-[11px] text-slate-400">{r.credentialHash?.slice(0, 14)}…</span>
                </span>
              ),
            },
            { key: "institution", label: "Institution", render: (r) => r.institution || "—" },
            { key: "issue", label: "Issue Type", render: (r) => catLabel(r.category) },
            { key: "openedBy", label: "Opened By", render: (r) => r.openedBy || "—" },
            {
              key: "status", label: "Status",
              render: (r) => {
                const m = STATUS_META[r.status] || { label: r.status, tone: "slate" };
                return <Badge tone={m.tone}>{m.label}</Badge>;
              },
            },
            { key: "requested", label: "Requested Date", render: (r) => fmtDate(r.createdAt) },
            {
              key: "resolve", label: "Action",
              render: (r) =>
                !isClosed(r.status) ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onResolve(r.id); }}
                    disabled={busy === r.id}
                    className="text-[12px] font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                  >
                    {busy === r.id ? "Resolving…" : "Resolve"}
                  </button>
                ) : (
                  <span className="text-[12px] text-slate-400">Closed</span>
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
