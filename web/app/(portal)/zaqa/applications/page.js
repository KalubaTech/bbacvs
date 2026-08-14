"use client";

// Regulatory case-management workspace: one unified list merging the four ZAQA
// case sources (validation queue, disputes, suspensions, revocations), each row
// tagged with its kind and deep-linked to the specialised workspace.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../../../components/portal/shell";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import {
  Badge, StatusTabs, SearchBox, SelectPill, ToolButton, DataTable, Pagination,
  usePager, KVGrid, SectionCard, PanelHeader, ActionBtn, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const KINDS = ["Validation", "Dispute", "Suspension", "Revocation"];

const KIND_META = {
  Validation: { tone: "blue", href: "/zaqa/validation", link: "Open in Validation Queue" },
  Dispute: { tone: "purple", href: "/zaqa/disputes", link: "Open in Disputes" },
  Suspension: { tone: "orange", href: "/zaqa/suspensions", link: "Open in Suspensions" },
  Revocation: { tone: "red", href: "/zaqa/revocations", link: "Open in Revocations" },
};

const VALIDATION_META = {
  pending: { label: "Pending review", tone: "blue" },
  validated: { label: "Validated", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  suspicious: { label: "Returned / suspicious", tone: "amber" },
  suspended: { label: "Suspended", tone: "orange" },
  under_dispute: { label: "Under dispute", tone: "purple" },
};

const REVOKE_REASON = {
  1: "Administrative error", 2: "Fraud detected", 3: "Regulatory action",
  4: "Holder request", 5: "Other",
};

const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-4)}` : "—");

function statusOf(c) {
  if (c.kind === "Dispute") {
    return { label: "Open dispute", tone: "purple" };
  }
  if (c.kind === "Suspension") return { label: "Suspended", tone: "orange" };
  if (c.kind === "Revocation") return { label: "Revoked", tone: "red" };
  return VALIDATION_META[c.raw.zaqaValidation] || { label: c.raw.zaqaValidation || "—", tone: "slate" };
}

export default function ZaqaApplicationsPage() {
  const { ready, token } = usePortalGuard(["zaqa"]);
  const router = useRouter();
  const [tab, setTab] = useState("All cases");
  const [q, setQ] = useState("");
  const [inst, setInst] = useState("");
  const [sel, setSel] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [val, disp, susp, rev] = await Promise.all([
        api.zaqaValidationList(token),
        api.zaqaDisputes(token).catch(() => ({ disputes: [] })),
        api.zaqaCredentialsByStatus(token, "suspended"),
        api.zaqaCredentialsByStatus(token, "revoked"),
      ]);
      const suspRows = susp.credentials || [];
      const revRows = rev.credentials || [];
      const claimed = new Set([...suspRows, ...revRows].map((r) => r.credentialHash));
      const byHash = new Map(
        [...(val.credentials || []), ...suspRows, ...revRows].map((r) => [r.credentialHash, r])
      );
      const list = [
        ...(val.credentials || [])
          .filter((r) => !claimed.has(r.credentialHash))
          .map((r) => ({ key: `validation:${r.credentialHash}`, kind: "Validation", raw: r, date: r.issuedAt })),
        ...(disp.disputes || []).map((d) => ({
          key: `dispute:${d.credentialHash}`,
          kind: "Dispute",
          raw: { ...(byHash.get(d.credentialHash) || {}), ...d },
          date: d.requestedAt,
        })),
        ...suspRows.map((r) => ({
          key: `suspension:${r.credentialHash}`, kind: "Suspension", raw: r,
          date: r.suspension?.suspendedAt || r.issuedAt,
        })),
        ...revRows.map((r) => ({ key: `revocation:${r.credentialHash}`, kind: "Revocation", raw: r, date: r.issuedAt })),
      ];
      list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setCases(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const kindCounts = useMemo(() => {
    const m = {};
    for (const c of cases) m[c.kind] = (m[c.kind] || 0) + 1;
    return m;
  }, [cases]);

  const institutions = useMemo(
    () => [...new Set(cases.map((c) => c.raw.institution).filter(Boolean))].sort(),
    [cases]
  );

  const activeKind = tab === "All cases" ? "" : tab.replace(/s$/, "");
  const rows = cases.filter((c) => {
    if (activeKind && c.kind !== activeKind) return false;
    if (inst && c.raw.institution !== inst) return false;
    if (!q) return true;
    const hay = `${c.raw.credentialHash || ""} ${c.raw.subjectName || ""} ${c.raw.institution || ""} ${c.raw.qualification || ""} ${c.raw.message || ""}`;
    return hay.toLowerCase().includes(q.toLowerCase());
  });

  const pg = usePager(rows, 10, [tab, q, inst]);
  const selected = cases.find((c) => c.key === sel) || null;

  const columns = [
    {
      key: "kind", label: "Case Type",
      render: (r) => <Badge tone={KIND_META[r.kind].tone}>{r.kind}</Badge>,
      csv: (r) => r.kind,
    },
    {
      key: "credentialHash", label: "Credential",
      render: (r) => <span className="font-mono text-[12px] font-semibold text-blue-600">{shortHash(r.raw.credentialHash)}</span>,
      csv: (r) => r.raw.credentialHash || "",
    },
    { key: "subjectName", label: "Holder", render: (r) => r.raw.subjectName || "—", csv: (r) => r.raw.subjectName || "" },
    { key: "institution", label: "Institution", render: (r) => r.raw.institution || "—", csv: (r) => r.raw.institution || "" },
    { key: "qualification", label: "Qualification", render: (r) => r.raw.qualification || "—", csv: (r) => r.raw.qualification || "" },
    {
      key: "status", label: "Status",
      render: (r) => {
        const s = statusOf(r);
        return <Badge tone={s.tone} dot>{s.label}</Badge>;
      },
      csv: (r) => statusOf(r).label,
    },
    { key: "date", label: "Case Date", render: (r) => fmtDate(r.date), csv: (r) => r.date || "" },
  ];

  if (!ready) return null;

  const tabs = [
    { label: "All cases", count: cases.length },
    { label: "Validations", count: kindCounts.Validation || 0 },
    { label: "Disputes", count: kindCounts.Dispute || 0 },
    { label: "Suspensions", count: kindCounts.Suspension || 0 },
    { label: "Revocations", count: kindCounts.Revocation || 0 },
  ];

  const panel = selected ? (
    <div>
      <PanelHeader
        title="Case Detail"
        badge={<Badge tone={KIND_META[selected.kind].tone}>{selected.kind}</Badge>}
        onClose={() => setSel(null)}
      />
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] text-slate-400">Credential Hash</div>
          <div className="break-all font-mono text-[12px] font-semibold text-slate-800">
            {selected.raw.credentialHash || "—"}
          </div>
        </div>
        {(() => {
          const s = statusOf(selected);
          return <Badge tone={s.tone} dot className="shrink-0">{s.label}</Badge>;
        })()}
      </div>

      <SectionCard title="Case Facts" className="mb-4" pad="p-4">
        <KVGrid
          cols={2}
          items={[
            { label: "Holder", value: selected.raw.subjectName || "—" },
            { label: "Institution", value: selected.raw.institution || "—" },
            { label: "Qualification", value: selected.raw.qualification || "—" },
            {
              label: "ZQF Level",
              value: selected.raw.zqfLevel != null ? `Level ${selected.raw.zqfLevel}` : "—",
            },
            { label: "Case Date", value: fmtDateTime(selected.date) },
            { label: "On-chain Status", value: selected.raw.status || "—" },
            ...(selected.kind === "Validation"
              ? [{ label: "ZAQA Reference", value: selected.raw.zaqaRef || "Not yet assigned" }]
              : []),
            ...(selected.kind === "Dispute"
              ? [{ label: "Correction Request", value: selected.raw.message || "—", }]
              : []),
            ...(selected.kind === "Suspension"
              ? [
                  { label: "Suspension Reason", value: selected.raw.suspension?.reason || "—" },
                  { label: "Suspended By", value: selected.raw.suspension?.suspendedBy || "—" },
                ]
              : []),
            ...(selected.kind === "Revocation"
              ? [
                  {
                    label: "Revocation Reason",
                    value: REVOKE_REASON[selected.raw.reasonCode] || "—",
                  },
                  {
                    label: "Superseded By",
                    value: selected.raw.supersededBy ? (
                      <span className="break-all font-mono text-[11px]">{selected.raw.supersededBy}</span>
                    ) : ("—"),
                  },
                ]
              : []),
          ]}
        />
      </SectionCard>

      <SectionCard title="Case History" className="mb-4" pad="p-4">
        <CaseTimeline events={selected.raw.events} />
      </SectionCard>

      <ActionBtn
        tone="navy"
        icon="chevronRight"
        full
        onClick={() =>
          router.push(
            selected.kind === "Validation"
              ? `/zaqa/validation?hash=${selected.raw.credentialHash}`
              : KIND_META[selected.kind].href
          )
        }
      >
        {KIND_META[selected.kind].link}
      </ActionBtn>
    </div>
  ) : null;

  return (
    <PortalShell
      portal="zaqa"
      active="applications"
      title="Case Management"
      subtitle="All open regulatory work in one place: national validations, disputes, suspensions and revocations."
      panel={panel}
      panelKey={selected?.key}
      panelWidth="w-[440px]"
    >
      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs tabs={tabs} active={tab} onChange={setTab} />
        <ErrorBanner error={error} onRetry={load} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox
            className="w-full sm:w-80"
            placeholder="Search by holder, institution, qualification or hash"
            value={q}
            onChange={setQ}
          />
          <SelectPill
            label="Kind"
            value={activeKind}
            options={KINDS}
            onChange={(v) => setTab(v ? `${v}s` : "All cases")}
          />
          <SelectPill label="Institution" value={inst} options={institutions} onChange={setInst} />
          <ToolButton
            icon="download"
            onClick={() => exportCSV("zaqa-cases", columns, rows)}
            disabled={rows.length === 0}
            className="disabled:opacity-50"
          >
            Export CSV
          </ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load} aria-label="Refresh" />
        </div>
        <DataTable
          dense
          loading={loading}
          rowKey="key"
          activeKey={selected?.key}
          onRowClick={(r) => setSel(r.key)}
          columns={columns}
          rows={pg.rows}
          emptyText="No cases match the current filters."
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>
    </PortalShell>
  );
}
