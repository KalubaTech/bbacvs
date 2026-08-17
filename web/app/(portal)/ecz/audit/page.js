"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import { usePortalGuard, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";
import {
  Badge, StatCard, StatRow, SectionCard, SelectPill, SearchBox, ToolButton,
  DataTable, Pagination, usePager, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import { CHART, Donut, Legend } from "../../../../components/portal/charts";

// Action prefix → badge tone / chart color for the activity trail.
const CATEGORY_META = {
  credential: { tone: "green", color: CHART.green },
  dispute: { tone: "amber", color: CHART.amber },
  user: { tone: "purple", color: CHART.purple },
  qualification: { tone: "blue", color: CHART.blue },
  programme: { tone: "indigo", color: CHART.teal },
  ecz: { tone: "teal", color: CHART.green },
  recognition: { tone: "orange", color: CHART.orange },
};
const category = (a) => (a || "").split(".")[0] || "other";
const actionTone = (a) => CATEGORY_META[category(a)]?.tone || "slate";

// Server-side ?prefix= filters offered in the pill.
const PREFIX_OPTIONS = [
  { value: "credential", label: "Credentials" },
  { value: "dispute", label: "Disputes" },
  { value: "user", label: "User Management" },
  { value: "qualification", label: "Qualifications" },
  { value: "ecz", label: "ECZ Approvals" },
];

export default function EczAuditPage() {
  const { ready, token } = usePortalGuard(["ecz"]);
  const [q, setQ] = useState("");
  const [prefix, setPrefix] = useState("");
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.activity(token, prefix || undefined);
      setEvents((res.activity || []).map((e, i) => ({ ...e, n: i + 1 })));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, prefix]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const rows = events.filter(
    (r) => !q || ((r.actor || "") + (r.action || "") + (r.summary || "") + (r.role || "")).toLowerCase().includes(q.toLowerCase())
  );
  const pg = usePager(rows, 15, [q, prefix]);

  const actors = new Set(events.map((e) => e.actor)).size;
  const credentialEvents = events.filter((e) => (e.action || "").startsWith("credential")).length;
  const disputeEvents = events.filter((e) => (e.action || "").startsWith("dispute")).length;
  const userEvents = events.filter((e) => (e.action || "").startsWith("user")).length;

  // Category breakdown — computed from the real rows currently loaded.
  const catCounts = {};
  for (const e of events) {
    const c = category(e.action);
    catCounts[c] = (catCounts[c] || 0) + 1;
  }
  const segments = Object.entries(catCounts).map(([k, v]) => ({
    label: k, value: v, color: CATEGORY_META[k]?.color || CHART.slate,
  }));
  const legend = segments.map((s) => ({
    label: s.label, color: s.color,
    value: `${s.value} (${events.length ? ((s.value / events.length) * 100).toFixed(1) : 0}%)`,
  }));

  const csvCols = [
    { key: "at", label: "Timestamp", csv: (r) => fmtDateTime(r.at) },
    { key: "actor", label: "Actor", csv: (r) => r.actor || "" },
    { key: "role", label: "Role", csv: (r) => r.role || "" },
    { key: "action", label: "Action" },
    { key: "summary", label: "Summary", csv: (r) => r.summary || "" },
  ];

  if (!ready) return null;

  return (
    <PortalShell
      portal="ecz"
      active="audit"
      title="ECZ Portal – Audit & Reports"
      actions={
        <ToolButton icon="download" onClick={() => exportCSV("ecz-audit-trail", csvCols, rows)}>
          Export CSV
        </ToolButton>
      }
    >
      <StatRow cols={5}>
        <StatCard icon="shield" iconTone="softblue" label="Audit Events" value={String(events.length)} sub="Latest 200 shown" />
        <StatCard icon="users" iconTone="purple" label="Distinct Actors" value={String(actors)} sub="Users with logged actions" />
        <StatCard icon="file" iconTone="softgreen" label="Credential Events" value={String(credentialEvents)} sub="Issue / submit / revoke" />
        <StatCard icon="gavel" iconTone="amber" label="Dispute Events" value={String(disputeEvents)} sub="Opened / resolved" />
        <StatCard icon="shieldCheck" iconTone="softgreen" label="User Management Events" value={String(userEvents)} sub="Accounts added / removed" />
      </StatRow>

      <ErrorBanner error={error} onRetry={load} />

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard title="Event Categories" className="xl:col-span-1">
          {events.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">No records yet.</div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Donut segments={segments} size={130} thickness={16} centerTitle={String(events.length)} centerSub="Events" />
              <Legend className="w-full" items={legend} />
            </div>
          )}
        </SectionCard>

        <div className="xl:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white shadow-card">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Accountability Trail — Who Changed What</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
              <SearchBox className="w-full sm:w-80" placeholder="Search actors, actions or summaries..." value={q} onChange={setQ} />
              <SelectPill label="Category" value={prefix} onChange={setPrefix} options={PREFIX_OPTIONS} />
              <ToolButton icon="refresh" className="ml-auto" onClick={load} aria-label="Refresh" />
            </div>
            <DataTable
              rowKey="n"
              dense
              loading={loading}
              emptyText="No audit events match this filter."
              columns={[
                { key: "at", label: "Time", render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.at)}</span> },
                {
                  key: "actor", label: "Actor",
                  render: (r) => (
                    <span className="block leading-tight">
                      <span className="block font-medium text-slate-700">{r.actor || "—"}</span>
                      <span className="block text-[11px] uppercase text-slate-400">{r.role || ""}</span>
                    </span>
                  ),
                },
                {
                  key: "action", label: "Action",
                  render: (r) => <Badge tone={actionTone(r.action)}>{r.action}</Badge>,
                },
                { key: "summary", label: "Summary", render: (r) => <span className="text-slate-600">{r.summary || "—"}</span> },
              ]}
              rows={pg.rows}
              footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
            />
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
