"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";
import {
  Badge, StatCard, StatRow, SearchBox, ToolButton, DataTable, Pagination,
  ActionBtn, KVGrid, WorkflowSteps, ProgressBar,
} from "../../../../components/portal/kit";

const STATUS_META = {
  open: { label: "Open", tone: "green" },
  resolved: { label: "Resolved", tone: "slate" },
};

const catLabel = (c) => (c ? c.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()) : "—");

function Section({ n, title, action, children }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10.5px] font-bold text-emerald-700">
            {n}
          </span>
          <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
        </div>
        {action}
      </div>
      <div className="rounded-xl border border-slate-200 p-3.5">{children}</div>
    </div>
  );
}

function DetailPanel({ req, busy, onResolve }) {
  if (!req) {
    return <div className="py-10 text-center text-[13px] text-slate-400">No request selected.</div>;
  }
  const st = STATUS_META[req.status] || { label: req.status, tone: "slate" };
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Request Details</h2>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[15px] font-bold text-slate-900">{String(req.id).slice(-10).toUpperCase()}</span>
          <Badge tone={st.tone} dot>{st.label}</Badge>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
          Opened {fmtDate(req.createdAt)}
        </span>
      </div>

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
          items={[
            { label: "Credential Hash", value: <span className="break-all">{req.credentialHash}</span> },
          ]}
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
                  {c.action === "opened" ? "Dispute opened" : c.action === "resolved" ? "Dispute resolved" : c.action}
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
            { label: "Under Review", state: req.status === "resolved" ? "done" : "current" },
            { label: "Resolved", state: req.status === "resolved" ? "done" : "pending" },
          ]}
        />
      </Section>

      <Section n={6} title="Case Progress">
        <ProgressBar value={req.status === "resolved" ? 100 : 50} tone={req.status === "resolved" ? "green" : "amber"} />
      </Section>

      <div className="flex flex-wrap gap-2">
        <ActionBtn tone="darkgreen">Respond</ActionBtn>
        <ActionBtn tone="outline" icon="upload">Upload Evidence</ActionBtn>
        <ActionBtn tone="softorange" icon="alert">Escalate</ActionBtn>
        {req.status !== "resolved" && (
          <ActionBtn tone="softgreen" icon="check" disabled={busy === req.id} onClick={() => onResolve(req.id)}>
            {busy === req.id ? "Resolving…" : "Resolve"}
          </ActionBtn>
        )}
      </div>
    </div>
  );
}

export default function EczRequestsPage() {
  const { ready, user, token } = usePortalGuard(["ecz"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.disputeQueue(token);
      setDisputes(res.disputes || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function onResolve(id) {
    const resolution = prompt("Resolution note:");
    if (!resolution) return;
    setBusy(id);
    try { await api.resolveDispute(token, id, resolution); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  if (!ready) return null;

  const rows = disputes.filter(
    (r) => !q ||
      (String(r.id) + (r.subjectName || "") + (r.institution || "") + (r.category || "") + (r.credentialHash || ""))
        .toLowerCase().includes(q.toLowerCase())
  );
  const selected = disputes.find((d) => d.id === sel) || rows[0] || disputes[0] || null;

  const open = disputes.filter((d) => d.status !== "resolved").length;
  const resolved = disputes.filter((d) => d.status === "resolved").length;
  const categories = new Set(disputes.map((d) => d.category)).size;
  const turnarounds = disputes
    .filter((d) => d.status === "resolved")
    .map((d) => {
      const done = (d.events || []).find((e) => e.action === "resolved");
      return done ? (new Date(done.at) - new Date(d.createdAt)) / 86400000 : null;
    })
    .filter((v) => v != null);
  const avgDays = turnarounds.length
    ? `${(turnarounds.reduce((s, v) => s + v, 0) / turnarounds.length).toFixed(1)} days`
    : "—";

  return (
    <PortalShell
      portal="ecz"
      active="requests"
      title="ECZ Portal – ZAQA Verification Requests"
      subtitle="Manage and respond to verification requests and disputes routed to ECZ through BBACVS."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={<ActionBtn tone="outline" icon="download">Export Queue</ActionBtn>}
      panel={<DetailPanel req={selected} busy={busy} onResolve={onResolve} />}
      panelWidth="w-[400px]"
    >
      <StatRow cols={5}>
        <StatCard icon="inbox" iconTone="softgreen" label="Open Requests" value={open} sub="Awaiting ECZ action" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Resolved Cases" value={resolved} sub="Closed with resolution" />
        <StatCard icon="help" iconTone="amber" label="Total Cases" value={disputes.length} sub="Routed to ECZ" />
        <StatCard icon="alert" iconTone="softred" label="Issue Categories" value={categories} sub="Distinct dispute types" />
        <StatCard icon="clock" iconTone="softblue" label="Average Turnaround Time" value={avgDays} sub="Open to resolution" />
      </StatRow>

      {error && <div className="mb-3 text-[13px] font-medium text-red-600">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Verification Requests Queue</h3>
          <Badge tone="green">{open}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-96" placeholder="Search by ID, name, institution, category..." value={q} onChange={setQ} />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="refresh" onClick={load}>Refresh</ToolButton>
        </div>
        <DataTable
          rowKey="id"
          activeKey={selected?.id}
          onRowClick={(r) => setSel(r.id)}
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
                r.status !== "resolved" ? (
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
          rows={rows}
          footer={
            rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-slate-400">No records yet.</div>
            ) : null
          }
        />
        <Pagination summary={`Showing ${rows.length} of ${disputes.length} requests`} page={1} pages={1} />
      </div>
    </PortalShell>
  );
}
