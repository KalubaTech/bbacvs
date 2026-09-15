"use client";

// ZAQA view of programme accreditation — READ ONLY. Programme accreditation is decided at the
// highest level by the sector regulator (HEA for higher education, TEVETA for TEVET, ECZ for
// secondary). ZAQA taps into those outcomes for credential validation and verification.

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { CatalogueView } from "../../../../components/portal/ProgrammeCatalogue";
import {
  Badge, StatCard, StatRow, SectionCard, StatusTabs, SearchBox, SelectPill, ToolButton,
  DataTable, Pagination, usePager, KVGrid, PanelHeader, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const STATUS_TONE = { pending: "amber", approved: "green", rejected: "red", draft: "slate" };
const STATUS_LABEL = { pending: "Awaiting regulator", approved: "Accredited", rejected: "Rejected", draft: "Draft" };
const REG_TONE = { HEA: "blue", TEVETA: "orange", ECZ: "green" };
const TABS = [
  { label: "Accredited", states: ["approved"] },
  { label: "Awaiting Regulator", states: ["pending"] },
  { label: "Rejected", states: ["rejected"] },
  { label: "All", states: ["approved", "pending", "rejected", "draft"] },
];

export default function ZaqaProgrammesPage() {
  const { ready, token } = usePortalGuard(["zaqa"]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("Accredited");
  const [q, setQ] = useState("");
  const [reg, setReg] = useState("");
  const [sel, setSel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows((await api.allProgrammes(token)).programmes || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const states = TABS.find((t) => t.label === tab)?.states || ["approved"];
  const filtered = rows.filter((p) =>
    states.includes(p.status) &&
    (!reg || p.regulator === reg) &&
    (!q || `${p.name} ${p.institution || ""} ${p.qualificationRef || ""}`.toLowerCase().includes(q.toLowerCase()))
  );
  const pg = usePager(filtered, 12, [tab, q, reg]);
  const selected = rows.find((p) => p.id === sel) || null;
  const byReg = rows.filter((p) => p.status === "approved").reduce((m, p) => { m[p.regulator] = (m[p.regulator] || 0) + 1; return m; }, {});

  if (!ready) return null;

  const columns = [
    { key: "name", label: "Programme", render: (r) => <span className="font-semibold text-slate-800">{r.name}</span> },
    { key: "institution", label: "Institution", render: (r) => r.institution || "—" },
    { key: "regulator", label: "Accrediting Authority", csv: (r) => r.regulator || "", render: (r) => <Badge tone={REG_TONE[r.regulator] || "slate"}>{r.regulator || "—"}</Badge> },
    { key: "zqfLevel", label: "NQF Level", render: (r) => (r.zqfLevel != null ? `Level ${r.zqfLevel}` : "—") },
    { key: "qualificationRef", label: "Registered Qualification", render: (r) => r.qualificationRef || "—" },
    { key: "decidedAt", label: "Decided", csv: (r) => (r.decidedAt ? fmtDate(r.decidedAt) : ""), render: (r) => (r.decidedAt ? fmtDate(r.decidedAt) : "—") },
    { key: "status", label: "Status", csv: (r) => STATUS_LABEL[r.status] || r.status, render: (r) => <Badge tone={STATUS_TONE[r.status] || "slate"}>{STATUS_LABEL[r.status] || r.status}</Badge> },
  ];

  const panel = selected ? (
    <div>
      <PanelHeader
        title={selected.name}
        badge={<Badge tone={STATUS_TONE[selected.status] || "slate"}>{STATUS_LABEL[selected.status] || selected.status}</Badge>}
        onClose={() => setSel(null)}
      />
      <SectionCard title="Accreditation Record" className="mb-4" pad="p-4">
        <KVGrid
          cols={2}
          items={[
            { label: "Institution", value: selected.institution || "—" },
            { label: "Accrediting authority", value: selected.regulator || "—" },
            { label: "NQF level", value: selected.zqfLevel != null ? `Level ${selected.zqfLevel}` : "—" },
            { label: "Registered qualification", value: selected.qualificationRef || "—" },
            { label: "Submitted", value: fmtDate(selected.createdAt) },
            { label: "Decided", value: selected.decidedAt ? fmtDate(selected.decidedAt) : "—" },
            { label: "Regulator note", value: selected.note || "—" },
          ]}
        />
      </SectionCard>
      <SectionCard title="Cycle Register" className="mb-4" pad="p-4">
        <CatalogueView programme={selected} compact />
      </SectionCard>
      <SectionCard title="Case History" className="mb-4" pad="p-4">
        <CaseTimeline events={selected.events} />
      </SectionCard>
      <p className="rounded-lg bg-blue-50 p-3 text-[12px] leading-snug text-blue-800">
        Read only. {selected.regulator || "The sector regulator"} holds final authority over this programme&apos;s
        accreditation; ZAQA relies on it when validating and verifying credentials awarded under the programme.
      </p>
    </div>
  ) : null;

  return (
    <PortalShell portal="zaqa" active="programmes" title="Accredited Programmes" panel={panel} panelKey={selected?.id} panelWidth="w-[420px]">
      <ErrorBanner error={error} onRetry={load} />
      <StatRow cols={4}>
        <StatCard icon="award" iconTone="softgreen" label="Accredited Programmes" value={loading ? "…" : String(rows.filter((p) => p.status === "approved").length)} />
        <StatCard icon="bank" iconTone="softblue" label="Accredited by HEA" value={loading ? "…" : String(byReg.HEA || 0)} />
        <StatCard icon="bolt" iconTone="orange" label="Accredited by TEVETA" value={loading ? "…" : String(byReg.TEVETA || 0)} />
        <StatCard icon="clock" iconTone="amber" label="Awaiting Regulator" value={loading ? "…" : String(rows.filter((p) => p.status === "pending").length)} />
      </StatRow>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[12.5px] text-slate-600 shadow-card">
        Programme accreditation is decided by the sector regulator — <span className="font-semibold">HEA</span> for higher
        education, <span className="font-semibold">TEVETA</span> for TEVET institutions and <span className="font-semibold">ECZ</span> for
        secondary certification. ZAQA does not accredit programmes; this register feeds the validation and verification checks.
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs tabs={TABS.map((t) => ({ label: t.label, count: rows.filter((p) => t.states.includes(p.status)).length }))} active={tab} onChange={setTab} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-full sm:w-80" placeholder="Search programme, institution or qualification ref" value={q} onChange={setQ} />
          <SelectPill label="Authority" value={reg} onChange={setReg} options={["HEA", "TEVETA", "ECZ"]} />
          <ToolButton icon="download" onClick={() => exportCSV("zaqa-accredited-programmes", columns, filtered)} disabled={!filtered.length} className="disabled:opacity-50">Export CSV</ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load} aria-label="Refresh" />
        </div>
        <DataTable
          dense
          rowKey="id"
          loading={loading}
          activeKey={selected?.id}
          onRowClick={(r) => setSel(r.id)}
          columns={columns}
          rows={pg.rows}
          emptyText="No programmes match the current filters."
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>
    </PortalShell>
  );
}
