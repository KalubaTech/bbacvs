"use client";

// Audit & history — two real ledgers side by side:
//   1. Activity trail  — the database accountability log of regulatory actions (api.activity)
//   2. On-chain events — immutable issuance events read from the contract (api.audit)
// The chart is computed from the real activity timestamps; exports are CSV of each ledger.

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, StatCard, StatRow, SectionCard, SearchBox, SelectPill, ToolButton,
  DataTable, Pagination, usePager, StatusTabs, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import { CHART, LineChart, Legend } from "../../../../components/portal/charts";
import { usePortalGuard, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const ROLE_TONE = {
  admin: "blue", zaqa: "teal", hea: "indigo", teveta: "cyan", ecz: "orange",
  issuer: "purple", holder: "slate",
};

const PREFIXES = [
  "credential.", "institution.", "dispute.", "qualification.", "application.", "recognition.",
];

const shortHex = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");

const ACTIVITY_COLUMNS = [
  { key: "at", label: "Timestamp", render: (r) => fmtDateTime(r.at), csv: (r) => r.at || "" },
  { key: "actor", label: "Actor" },
  {
    key: "role", label: "Role",
    render: (r) => <Badge tone={ROLE_TONE[r.role] || "slate"}>{(r.role || "—").toUpperCase()}</Badge>,
    csv: (r) => r.role || "",
  },
  { key: "action", label: "Action", render: (r) => <span className="font-mono text-[12px]">{r.action}</span> },
  { key: "summary", label: "Summary" },
];

const CHAIN_COLUMNS = [
  { key: "blockNumber", label: "Block" },
  {
    key: "txHash", label: "Transaction",
    render: (r) => <span className="font-mono text-[12px]">{shortHex(r.txHash)}</span>,
    csv: (r) => r.txHash || "",
  },
  {
    key: "issuer", label: "Issuer Wallet",
    render: (r) => <span className="font-mono text-[12px]">{shortHex(r.issuer)}</span>,
    csv: (r) => r.issuer || "",
  },
  {
    key: "credentialHash", label: "Credential Hash",
    render: (r) => <span className="font-mono text-[12px]">{shortHex(r.credentialHash)}</span>,
    csv: (r) => r.credentialHash || "",
  },
  {
    key: "timestamp", label: "Anchored At",
    render: (r) => (r.timestamp ? fmtDateTime(new Date(r.timestamp * 1000)) : "—"),
    csv: (r) => (r.timestamp ? new Date(r.timestamp * 1000).toISOString() : ""),
  },
];

export default function ZaqaAuditPage() {
  const { ready, token } = usePortalGuard(["zaqa"]);
  const [tab, setTab] = useState("Activity trail");
  const [activity, setActivity] = useState([]);
  const [events, setEvents] = useState([]);
  const [loadingAct, setLoadingAct] = useState(true);
  const [loadingChain, setLoadingChain] = useState(true);
  const [error, setError] = useState(null);
  const [chainError, setChainError] = useState(null);
  const [q, setQ] = useState("");
  const [prefix, setPrefix] = useState("");

  const load = useCallback(async () => {
    setLoadingAct(true);
    setLoadingChain(true);
    setError(null);
    setChainError(null);
    api
      .activity(token)
      .then((a) => setActivity(a.activity || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingAct(false));
    api
      .audit(token)
      .then((b) => setEvents(b.events || []))
      .catch((err) => setChainError(err.message))
      .finally(() => setLoadingChain(false));
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const actRows = activity.filter((l) => {
    if (prefix && !(l.action || "").startsWith(prefix)) return false;
    return !q || `${l.actor} ${l.role} ${l.action} ${l.summary}`.toLowerCase().includes(q.toLowerCase());
  });
  const chainRows = events.filter(
    (e) => !q || `${e.txHash} ${e.issuer} ${e.credentialHash} ${e.blockNumber}`.toLowerCase().includes(q.toLowerCase())
  );
  const pgAct = usePager(actRows, 15, [q, prefix, tab]);
  const pgChain = usePager(chainRows, 15, [q, tab]);

  if (!ready) return null;

  // Actions per day over the last 14 days, computed from the real trail.
  const days = [...Array(14)].map((_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (13 - i));
    return d;
  });
  const perDay = days.map(
    (d) =>
      activity.filter((a) => {
        if (!a.at) return false;
        const t = new Date(a.at);
        return (
          t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth() && t.getDate() === d.getDate()
        );
      }).length
  );
  const dayLabels = days.map((d, i) =>
    i % 2 === 0 ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""
  );

  const today = new Date().toDateString();
  const todayCount = activity.filter((a) => a.at && new Date(a.at).toDateString() === today).length;
  const zaqaActions = activity.filter((a) => (a.action || "").startsWith("zaqa.")).length;

  const isActivityTab = tab === "Activity trail";

  return (
    <PortalShell
      portal="zaqa"
      active="audit"
      title="Audit & History"
      subtitle="The regulatory accountability trail and the immutable on-chain issuance ledger, with CSV reports."
    >
      <StatRow cols={4}>
        <StatCard icon="clipboard" iconTone="softblue" label="Activity Records" value={loadingAct ? "…" : activity.length} sub="Accountability trail" />
        <StatCard icon="clock" iconTone="softgreen" label="Actions Today" value={loadingAct ? "…" : todayCount} sub="Recorded today" />
        <StatCard icon="shieldCheck" iconTone="amber" label="ZAQA Decisions" value={loadingAct ? "…" : zaqaActions} sub="Validation & enforcement actions" />
        <StatCard icon="link" iconTone="purple" label="On-chain Events" value={loadingChain ? "…" : events.length} sub="Issuance anchors" />
      </StatRow>

      {activity.length > 0 && (
        <SectionCard title="Actions Per Day (last 14 days)" className="mb-4" pad="p-4">
          <LineChart
            height={160}
            labels={dayLabels}
            series={[{ points: perDay, color: CHART.blue, label: "Actions", area: true }]}
          />
          <Legend className="mt-2" items={[{ label: "Recorded regulatory actions", color: CHART.blue }]} />
        </SectionCard>
      )}

      <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs
          tabs={[
            { label: "Activity trail", count: activity.length },
            { label: "On-chain events", count: events.length },
          ]}
          active={tab}
          onChange={setTab}
        />
        {isActivityTab ? <ErrorBanner error={error} onRetry={load} /> : <ErrorBanner error={chainError} onRetry={load} />}
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox
            className="w-full sm:w-72"
            placeholder={isActivityTab ? "Search the activity trail..." : "Search on-chain events..."}
            value={q}
            onChange={setQ}
          />
          {isActivityTab && (
            <SelectPill
              label="Action"
              value={prefix}
              onChange={setPrefix}
              options={PREFIXES.map((p) => ({ value: p, label: p.replace(/\.$/, "") }))}
            />
          )}
          <ToolButton icon="refresh" className="ml-auto" onClick={load} aria-label="Refresh" />
        </div>
        {isActivityTab ? (
          <DataTable
            dense
            loading={loadingAct}
            columns={ACTIVITY_COLUMNS}
            rows={pgAct.rows}
            emptyText="No activity recorded yet."
            footer={<Pagination {...pgAct.props} className="border-t border-slate-100" />}
          />
        ) : (
          <DataTable
            dense
            loading={loadingChain}
            columns={CHAIN_COLUMNS}
            rows={pgChain.rows}
            emptyText="No on-chain issuance events found."
            footer={<Pagination {...pgChain.props} className="border-t border-slate-100" />}
          />
        )}
      </div>

      <SectionCard title="Reports" pad="p-4">
        <div id="reports" />
        <p className="mb-3 text-[12.5px] text-slate-500">
          Download either ledger as CSV — the export honours the current search and filter.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <ToolButton
            icon="download"
            onClick={() => exportCSV("zaqa-activity-trail", ACTIVITY_COLUMNS, actRows)}
            disabled={actRows.length === 0}
            className="disabled:opacity-50"
          >
            Export Activity Trail (CSV)
          </ToolButton>
          <ToolButton
            icon="download"
            onClick={() => exportCSV("zaqa-onchain-events", CHAIN_COLUMNS, chainRows)}
            disabled={chainRows.length === 0}
            className="disabled:opacity-50"
          >
            Export On-chain Events (CSV)
          </ToolButton>
        </div>
      </SectionCard>
    </PortalShell>
  );
}
