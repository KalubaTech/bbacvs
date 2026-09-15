"use client";

// System activity — the platform-wide accountability trail: who changed what, across every
// portal. Read from the database activity log (api.activity); filterable and exportable.
import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, StatCard, StatRow, SectionCard, SearchBox, SelectPill, ToolButton,
  DataTable, Pagination, usePager, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const ROLE_TONE = {
  admin: "blue", zaqa: "teal", hea: "indigo", teveta: "cyan", ecz: "orange", issuer: "purple", holder: "slate",
};
const AREAS = [
  { value: "credential.", label: "Credentials" },
  { value: "institution.", label: "Institutions" },
  { value: "billing.", label: "Billing" },
  { value: "dispute.", label: "Disputes" },
  { value: "qualification.", label: "Qualifications" },
  { value: "application.", label: "Applications" },
  { value: "recognition.", label: "Recognition" },
  { value: "user.", label: "Users" },
];

const COLUMNS = [
  { key: "at", label: "When", render: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.at)}</span>, csv: (r) => r.at || "" },
  { key: "summary", label: "What changed", render: (r) => <span className="text-slate-800">{r.summary || r.action}</span> },
  { key: "actor", label: "Who" },
  {
    key: "role", label: "Role",
    render: (r) => <Badge tone={ROLE_TONE[r.role] || "slate"}>{(r.role || "—").toUpperCase()}</Badge>,
    csv: (r) => r.role || "",
  },
  { key: "action", label: "Action", render: (r) => <span className="font-mono text-[11.5px] text-slate-500">{r.action}</span> },
];

export default function AdminActivityPage() {
  const { ready, token } = usePortalGuard(["admin"]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [role, setRole] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try { setRows((await api.activity(token)).activity || []); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!area || (r.action || "").startsWith(area)) &&
      (!role || r.role === role) &&
      (!needle || `${r.summary} ${r.action} ${r.actor}`.toLowerCase().includes(needle))
    );
  }, [rows, q, area, role]);
  const pager = usePager(filtered, 25, [q, area, role]);

  const today = rows.filter((r) => r.at && new Date(r.at).toDateString() === new Date().toDateString()).length;
  const actors = new Set(rows.map((r) => r.actor).filter(Boolean)).size;
  const roles = [...new Set(rows.map((r) => r.role).filter(Boolean))].map((v) => ({ value: v, label: v.toUpperCase() }));

  if (!ready) return null;
  return (
    <PortalShell
      portal="admin"
      active="activity"
      title="System activity"
      subtitle="Every recorded change across all portals — who did what, and when."
      actions={
        <>
          <ToolButton icon="refresh" onClick={load}>Refresh</ToolButton>
          <ToolButton icon="download" onClick={() => exportCSV("bbacvs-activity.csv", COLUMNS, filtered)}>Export CSV</ToolButton>
        </>
      }
    >
      <StatRow cols={3}>
        <StatCard icon="audit" iconTone="softblue" label="Recorded actions" value={rows.length} />
        <StatCard icon="clock" iconTone="amber" label="Today" value={today} />
        <StatCard icon="users" iconTone="softgreen" label="Distinct actors" value={actors} />
      </StatRow>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchBox className="w-full sm:w-72" placeholder="Search summary, action or actor…" value={q} onChange={setQ} />
        <SelectPill label="Area" value={area} onChange={setArea} options={AREAS} />
        <SelectPill label="Role" value={role} onChange={setRole} options={roles} />
      </div>

      <ErrorBanner error={error} onRetry={load} />

      <SectionCard title="Activity trail" pad="p-0">
        <DataTable
          columns={COLUMNS}
          rows={pager.rows}
          loading={loading}
          emptyText="No activity matches these filters."
          footer={<Pagination {...pager.props} summary={`${filtered.length} action(s)`} />}
        />
      </SectionCard>
    </PortalShell>
  );
}
