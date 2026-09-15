"use client";

// ZAQA trusted-issuer registry: every institution on the platform with its sector regulator's
// accreditation status, on-chain authorisation and the ZAQA "trusted issuer" flag.

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { ScopeList, ScopeModal } from "../../../../components/portal/ScopeEditor";
import {
  Badge, StatCard, StatRow, SectionCard, StatusTabs, SearchBox, SelectPill, ToolButton, Toggle,
  DataTable, Pagination, usePager, KVGrid, PanelHeader, ActionBtn, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const SECTOR = {
  higher_ed: { label: "Higher Education", regulator: "HEA", tone: "blue" },
  tevet: { label: "TEVET", regulator: "TEVETA", tone: "orange" },
  secondary: { label: "Secondary", regulator: "ECZ", tone: "green" },
};
const sectorOf = (i) => SECTOR[i.sector] || SECTOR.higher_ed;
const STATUS_TONE = { approved: "green", pending: "amber", suspended: "red" };
const TABS = [
  { label: "All", match: () => true },
  { label: "ZAQA Trusted", match: (i) => i.zaqaTrusted },
  { label: "Not Trusted", match: (i) => !i.zaqaTrusted },
  { label: "Pending Chain", match: (i) => !i.onChain },
];

export default function ZaqaIssuersPage() {
  const { ready, token } = usePortalGuard(["zaqa"]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [sel, setSel] = useState(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeError, setScopeError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows((await api.zaqaRegistry(token)).issuers || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function saveScopes(scopes) {
    if (!selected) return;
    setBusy(selected.id); setScopeError(null);
    try { await api.zaqaSetScopes(token, selected.id, scopes); setScopeOpen(false); await load(); }
    catch (err) { setScopeError(err.message); }
    finally { setBusy(null); }
  }
  async function setTrust(i, zaqaTrusted) {
    setBusy(i.id);
    setError(null);
    try { await api.zaqaSetTrust(token, i.id, zaqaTrusted, ""); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  const match = TABS.find((t) => t.label === tab)?.match || (() => true);
  const filtered = rows.filter((i) =>
    match(i) && (!sector || i.sector === sector) &&
    (!q || `${i.institution || ""}`.toLowerCase().includes(q.toLowerCase()))
  );
  const pg = usePager(filtered, 12, [tab, q, sector]);
  const selected = rows.find((i) => i.id === sel) || null;

  if (!ready) return null;

  const columns = [
    { key: "institution", label: "Institution", render: (r) => <span className="font-semibold text-slate-800">{r.institution}</span> },
    { key: "sector", label: "Sector", csv: (r) => sectorOf(r).label, render: (r) => <Badge tone={sectorOf(r).tone}>{sectorOf(r).label}</Badge> },
    { key: "regulator", label: "Regulator", csv: (r) => sectorOf(r).regulator, render: (r) => sectorOf(r).regulator },
    {
      key: "heaStatus", label: "Regulator Status", csv: (r) => r.heaStatus || "approved",
      render: (r) => <Badge tone={STATUS_TONE[r.heaStatus] || "green"}>{r.heaStatus || "approved"}</Badge>,
    },
    { key: "onChain", label: "On-chain", csv: (r) => (r.onChain ? "Authorised" : "Pending"), render: (r) => (r.onChain ? <Badge tone="outline">Authorised</Badge> : <Badge tone="amber">Pending</Badge>) },
    {
      key: "zaqaTrusted", label: "ZAQA Trusted", csv: (r) => (r.zaqaTrusted ? "Yes" : "No"),
      render: (r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Toggle on={!!r.zaqaTrusted} disabled={busy === r.id} onChange={(v) => setTrust(r, v)} label={r.zaqaTrusted ? "Trusted" : "Not trusted"} />
        </span>
      ),
    },
    { key: "createdAt", label: "Registered", csv: (r) => fmtDate(r.createdAt), render: (r) => fmtDate(r.createdAt) },
  ];

  const panel = selected ? (
    <div>
      <PanelHeader
        title={selected.institution}
        badge={<Badge tone={selected.zaqaTrusted ? "green" : "slate"}>{selected.zaqaTrusted ? "ZAQA trusted" : "Not trusted"}</Badge>}
        onClose={() => setSel(null)}
      />
      <SectionCard title="Registry Record" className="mb-4" pad="p-4">
        <KVGrid
          cols={2}
          items={[
            { label: "Sector", value: sectorOf(selected).label },
            { label: "Regulator", value: sectorOf(selected).regulator },
            { label: "Regulator status", value: selected.heaStatus || "approved" },
            { label: "On-chain authorisation", value: selected.onChain ? "Authorised" : "Pending" },
            { label: "Accredited programmes", value: String((selected.accreditedPrograms || []).length) },
            { label: "Registered", value: fmtDate(selected.createdAt) },
          ]}
        />
        {(selected.accreditedPrograms || []).length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3">
            {selected.accreditedPrograms.map((p) => (
              <li key={p} className="flex items-start gap-2 text-[12.5px] text-slate-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />{p}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard
        title="Award Restrictions"
        action={<button type="button" onClick={() => { setScopeOpen(true); setScopeError(null); }} className="text-[11px] font-semibold text-blue-600 hover:underline">Edit ZAQA restrictions</button>}
        className="mb-4"
        pad="p-4"
      >
        <ScopeList scopes={selected.accreditationScopes} />
        <p className="mt-2 text-[11px] text-slate-400">
          {sectorOf(selected).regulator} sets the sector scope; ZAQA may add national restrictions. Every authority&apos;s scope in force in the award year must permit the award.
        </p>
      </SectionCard>
      <SectionCard title="History" className="mb-4" pad="p-4">
        <CaseTimeline events={selected.events} />
      </SectionCard>
      <ActionBtn
        tone={selected.zaqaTrusted ? "softred" : "green"}
        icon={selected.zaqaTrusted ? "x" : "shieldCheck"}
        full
        disabled={busy === selected.id}
        className="disabled:opacity-50"
        onClick={() => setTrust(selected, !selected.zaqaTrusted)}
      >
        {busy === selected.id ? "Saving…" : selected.zaqaTrusted ? "Remove ZAQA trust" : "Mark as ZAQA trusted issuer"}
      </ActionBtn>
      <p className="mt-3 text-[11.5px] text-slate-400">
        Accreditation itself is granted by {sectorOf(selected).regulator}; the ZAQA trust flag records that the
        authority recognises this issuer for national validation.
      </p>
    </div>
  ) : null;

  const trusted = rows.filter((i) => i.zaqaTrusted).length;

  return (
    <PortalShell portal="zaqa" active="issuers" title="Trusted Issuer Registry" panel={panel} panelKey={selected?.id} panelWidth="w-[420px]">
      <ErrorBanner error={error} onRetry={load} />
      <StatRow cols={5}>
        <StatCard icon="bank" iconTone="softblue" label="Registered Issuers" value={loading ? "…" : String(rows.length)} />
        <StatCard icon="shieldCheck" iconTone="softgreen" label="ZAQA Trusted" value={loading ? "…" : String(trusted)} />
        <StatCard icon="graduation" iconTone="blue" label="Higher Education (HEA)" value={loading ? "…" : String(rows.filter((i) => (i.sector || "higher_ed") === "higher_ed").length)} />
        <StatCard icon="bolt" iconTone="orange" label="TEVET (TEVETA)" value={loading ? "…" : String(rows.filter((i) => i.sector === "tevet").length)} />
        <StatCard icon="book" iconTone="softgreen" label="Secondary (ECZ)" value={loading ? "…" : String(rows.filter((i) => i.sector === "secondary").length)} />
      </StatRow>

      <ScopeModal open={scopeOpen && !!selected} institution={selected} regulator="ZAQA" scopes={selected?.accreditationScopes || []} busy={busy === selected?.id} error={scopeError} onClose={() => { setScopeOpen(false); setScopeError(null); }} onSave={saveScopes} />
      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs tabs={TABS.map((t) => ({ label: t.label, count: rows.filter(t.match).length }))} active={tab} onChange={setTab} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-full sm:w-72" placeholder="Search institutions…" value={q} onChange={setQ} />
          <SelectPill label="Sector" value={sector} onChange={setSector} options={Object.entries(SECTOR).map(([value, m]) => ({ value, label: m.label }))} />
          <ToolButton icon="download" onClick={() => exportCSV("zaqa-issuer-registry", columns, filtered)} disabled={!filtered.length} className="disabled:opacity-50">Export CSV</ToolButton>
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
          emptyText="No issuers match the current filters."
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>
    </PortalShell>
  );
}
