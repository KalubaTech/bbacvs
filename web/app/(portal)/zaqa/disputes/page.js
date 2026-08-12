"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, StatusTabs, SearchBox, ToolButton, DataTable, Pagination, TabBar,
  Timeline, KV, KVRow, ActionBtn, SectionCard,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const STATUS_TONE = { Open: "blue", Resolved: "green" };
const STATUS_LABEL = { open: "Open", resolved: "Resolved" };

const catLabel = (c) => (c || "other").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-4)}` : "—");

function timelineFromEvents(d) {
  const items = (d.events || []).map((e) => ({
    title: catLabel(e.action),
    sub: `${e.note || ""}${e.actor ? ` — by ${e.actor}` : ""}`,
    time: fmtDateTime(e.at),
    state: e.action === "opened" ? "warn" : e.action === "resolved" ? "done" : "current",
  }));
  if (d.status === "open") items.push({ title: "Decision Pending", sub: "Awaiting resolution by the lead authority", state: "pending" });
  return items;
}

function DetailPanel({ dispute, onResolve, busy }) {
  const [tab, setTab] = useState("Timeline");
  const statusLabel = STATUS_LABEL[dispute.status] || dispute.status;
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Dispute Details</h2>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-slate-900">{shortHash(dispute.credentialHash)}</span>
            <Badge tone={STATUS_TONE[statusLabel] || "slate"} dot>{statusLabel}</Badge>
          </div>
          <button className="mt-0.5 text-[12.5px] font-semibold text-blue-600 hover:underline">
            {catLabel(dispute.category)}
          </button>
        </div>
        <div className="text-right leading-tight">
          <div className="text-[11px] text-slate-400">Date Opened</div>
          <div className="text-[12.5px] font-semibold text-slate-800">{fmtDateTime(dispute.createdAt)}</div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-200 p-3.5">
        <KV label="Credential Hash" value={shortHash(dispute.credentialHash)} />
        <KV label="Raised By" value={dispute.openedBy || "—"} />
        <KV label="Linked Institution" value={dispute.institution || "—"} />
        <KV label="Lead Authority" value={(dispute.leadAuthority || "—").toUpperCase()} />
      </div>

      <div className="mb-4">
        <TabBar tabs={["Timeline", "Evidence", "Parties", "Deadlines", "Comments"]} active={tab} onChange={setTab} />
      </div>

      <div className="mb-4">
        <Timeline items={timelineFromEvents(dispute)} />
      </div>

      <SectionCard title="Summary" className="mb-4">
        <p className="mb-2 text-[12.5px] leading-relaxed text-slate-600">
          {dispute.description || "No description provided."}
        </p>
        <div className="divide-y divide-slate-100">
          <KVRow label="Category" value={catLabel(dispute.category)} />
          <KVRow label="Subject" value={dispute.subjectName || "—"} />
          <KVRow label="Current Status" value={<Badge tone={STATUS_TONE[statusLabel] || "slate"} dot>{statusLabel}</Badge>} />
          <KVRow label="Resolution" value={dispute.resolution || "—"} />
        </div>
      </SectionCard>

      <SectionCard title="Quick Actions">
        <div className="space-y-2">
          <ActionBtn tone="softblue" full icon="fileText">Request Evidence</ActionBtn>
          <ActionBtn tone="softorange" full icon="pause">Suspend Pending Review</ActionBtn>
          <ActionBtn
            tone="softgreen" full icon="checkCircle"
            disabled={busy || dispute.status === "resolved"}
            className={busy || dispute.status === "resolved" ? "opacity-50" : ""}
            onClick={() => onResolve(dispute)}
          >
            {busy ? "Resolving…" : "Resolve"}
          </ActionBtn>
          <ActionBtn tone="softpurple" full icon="scale">Escalate Appeal</ActionBtn>
          <ActionBtn tone="navy" full icon="x">Close Case</ActionBtn>
        </div>
      </SectionCard>
    </div>
  );
}

export default function ZaqaDisputesPage() {
  const { ready, user, token } = usePortalGuard(["zaqa"]);
  const [disputes, setDisputes] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState("Open");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.disputeQueue(token);
      setDisputes(res.disputes || []);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function resolve(d) {
    const resolution = prompt("Resolution note for this dispute:");
    if (!resolution) return;
    setBusy(d.id);
    try { await api.resolveDispute(token, d.id, resolution); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  if (!ready) return null;

  const openCount = disputes.filter((d) => d.status === "open").length;
  const resolvedCount = disputes.filter((d) => d.status === "resolved").length;
  const TABS = [
    { label: "Open", count: openCount },
    { label: "Resolved", count: resolvedCount },
  ];

  const rows = disputes.filter(
    (d) =>
      (tab === "Open" ? d.status === "open" : d.status === "resolved") &&
      (!q ||
        `${d.credentialHash} ${d.openedBy} ${d.institution} ${d.category} ${d.subjectName}`
          .toLowerCase().includes(q.toLowerCase()))
  );
  const selected = disputes.find((d) => d.id === sel) || rows[0] || null;

  return (
    <PortalShell
      portal="zaqa"
      active="disputes"
      title="ZAQA Portal – Disputes & Appeals"
      subtitle="Manage disputes, review evidence, make decisions and track appeals across the BBACVS platform."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={<ActionBtn tone="navy" icon="plus">New Dispute</ActionBtn>}
      panel={selected ? <DetailPanel dispute={selected} onResolve={resolve} busy={busy === selected.id} /> : null}
      panelWidth="w-[420px]"
    >
      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs tabs={TABS} active={tab} onChange={setTab} />
        {error && <div className="mb-3 text-[12.5px] font-medium text-red-600">{error}</div>}
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-72" placeholder="Search disputes..." value={q} onChange={setQ} />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
          <ToolButton icon="refresh" onClick={load} />
        </div>
        <DataTable
          rowKey="id"
          activeKey={selected?.id}
          onRowClick={(r) => setSel(r.id)}
          columns={[
            { key: "credentialHash", label: "Credential", render: (r) => <span className="font-semibold text-blue-600">{shortHash(r.credentialHash)}</span> },
            { key: "subjectName", label: "Subject", render: (r) => r.subjectName || "—" },
            { key: "category", label: "Category", render: (r) => catLabel(r.category) },
            { key: "openedBy", label: "Raised By" },
            { key: "institution", label: "Linked Institution" },
            { key: "createdAt", label: "Date Opened", render: (r) => fmtDate(r.createdAt) },
            { key: "leadAuthority", label: "Lead Authority", render: (r) => (r.leadAuthority || "—").toUpperCase() },
            { key: "status", label: "Status", render: (r) => <Badge tone={STATUS_TONE[STATUS_LABEL[r.status]] || "slate"}>{STATUS_LABEL[r.status] || r.status}</Badge> },
          ]}
          rows={rows}
        />
        {rows.length === 0 && (
          <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
        )}
        <Pagination summary={`Showing ${rows.length} of ${disputes.length} disputes`} page={1} pages={1} />
      </div>
    </PortalShell>
  );
}
