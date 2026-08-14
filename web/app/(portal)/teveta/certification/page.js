"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, StatCard, StatRow, SectionCard, StatusTabs, SearchBox, ToolButton,
  DataTable, Pagination, usePager, KVGrid, PanelHeader, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { api } from "../../../../lib/api";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";

// ZAQA validation state → label / tone.
const VMETA = {
  draft: { label: "Draft", tone: "slate" },
  pending: { label: "Pending", tone: "amber" },
  validated: { label: "Validated", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  suspicious: { label: "Flagged", tone: "orange" },
  suspended: { label: "Suspended", tone: "red" },
  under_dispute: { label: "Under Dispute", tone: "purple" },
};
// Lifecycle status → label / tone.
const SMETA = {
  active: { label: "Active", tone: "green" },
  pending: { label: "Pending", tone: "amber" },
  suspended: { label: "Suspended", tone: "orange" },
  revoked: { label: "Revoked", tone: "red" },
  superseded: { label: "Superseded", tone: "slate" },
};

const shortHash = (h) => (h && h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h || "—");

function DetailPanel({ rec, onClose }) {
  const v = VMETA[rec.zaqaValidation || "draft"] || VMETA.draft;
  const s = SMETA[rec.status] || { label: rec.status || "—", tone: "slate" };
  return (
    <div>
      <PanelHeader title="Certification Record" badge={<Badge tone={s.tone} dot>{s.label}</Badge>} onClose={onClose} />

      <div className="mb-4">
        <div className="text-[11px] text-slate-400">Credential Hash</div>
        <div className="break-all text-[12.5px] font-bold text-slate-900">{rec.credentialHash}</div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <KVGrid
          cols={2}
          items={[
            { label: "Learner", value: rec.subjectName || "—" },
            { label: "Qualification", value: rec.qualification || "—" },
            { label: "Provider", value: rec.institution || "—" },
            { label: "NQF Level", value: rec.zqfLevel != null ? `Level ${rec.zqfLevel}` : "—" },
            { label: "Type", value: rec.credentialType || "—" },
            { label: "Issued", value: fmtDate(rec.issuedAt) },
            { label: "Status", value: <Badge tone={s.tone}>{s.label}</Badge> },
            { label: "ZAQA Validation", value: <Badge tone={v.tone}>{v.label}</Badge> },
          ]}
        />
        {rec.zaqaRef ? (
          <div className="mt-3 border-t border-slate-100 pt-2.5">
            <div className="text-[11px] font-medium text-slate-400">ZAQA Reference</div>
            <div className="mt-0.5 text-[12.5px] font-semibold text-slate-800">{rec.zaqaRef}</div>
          </div>
        ) : null}
      </div>

      {rec.suspension && (rec.suspension.reason || rec.suspension.at || rec.suspension.active) ? (
        <SectionCard title="Suspension" className="mb-4" pad="p-3.5">
          <div className="flex items-center gap-2">
            <Badge tone={rec.suspension.active ? "orange" : "slate"}>
              {rec.suspension.active ? "Currently suspended" : "Previously suspended"}
            </Badge>
          </div>
          {rec.suspension.reason && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">{rec.suspension.reason}</p>
          )}
          {rec.suspension.at && (
            <div className="mt-1 text-[11px] text-slate-400">{fmtDateTime(rec.suspension.at)}</div>
          )}
        </SectionCard>
      ) : null}

      {rec.supersededBy ? (
        <SectionCard title="Superseded" className="mb-4" pad="p-3.5">
          <p className="text-[12.5px] leading-relaxed text-slate-600">
            This record has been replaced by a corrected credential.
          </p>
          <div className="mt-1.5 break-all text-[11.5px] font-mono text-slate-500">{rec.supersededBy}</div>
        </SectionCard>
      ) : null}

      <SectionCard title="Case History" pad="p-4">
        <CaseTimeline events={rec.events} />
      </SectionCard>
    </div>
  );
}

export default function TevetaCertificationPage() {
  const { ready, token } = usePortalGuard(["teveta"]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("All");
  const [sel, setSel] = useState(null);
  const [creds, setCreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.tevetaCredentials(token);
      setCreds(r.credentials || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const counts = useMemo(() => {
    const c = { All: creds.length };
    for (const k of Object.keys(VMETA)) c[VMETA[k].label] = 0;
    for (const item of creds) {
      const l = (VMETA[item.zaqaValidation || "draft"] || VMETA.draft).label;
      c[l] = (c[l] || 0) + 1;
    }
    return c;
  }, [creds]);

  const rows = creds.filter((r) => {
    const l = (VMETA[r.zaqaValidation || "draft"] || VMETA.draft).label;
    if (tab !== "All" && l !== tab) return false;
    return (
      !q ||
      `${r.credentialHash || ""} ${r.subjectName || ""} ${r.qualification || ""} ${r.institution || ""}`
        .toLowerCase()
        .includes(q.toLowerCase())
    );
  });
  const pg = usePager(rows, 10, [q, tab]);
  const selected = creds.find((c) => c.credentialHash === sel) || null;

  const tabs = [{ label: "All", count: counts.All }].concat(
    Object.values(VMETA)
      .map((m) => ({ label: m.label, count: counts[m.label] || 0 }))
      .filter((t) => t.count > 0)
  );

  const csvCols = [
    { key: "credentialHash", label: "Credential Hash" },
    { key: "subjectName", label: "Learner" },
    { key: "qualification", label: "Qualification" },
    { key: "institution", label: "Provider" },
    { key: "zqfLevel", label: "NQF Level" },
    { key: "status", label: "Status", csv: (r) => SMETA[r.status]?.label || r.status || "" },
    { key: "zaqaValidation", label: "ZAQA Validation", csv: (r) => (VMETA[r.zaqaValidation || "draft"] || VMETA.draft).label },
    { key: "zaqaRef", label: "ZAQA Ref" },
    { key: "issuedAt", label: "Issued", csv: (r) => fmtDate(r.issuedAt) },
  ];

  const active = creds.filter((c) => c.status === "active").length;
  const validated = creds.filter((c) => c.zaqaValidation === "validated").length;
  const revoked = creds.filter((c) => c.status === "revoked").length;
  const flagged = creds.filter((c) => ["suspicious", "under_dispute", "suspended"].includes(c.zaqaValidation)).length;

  if (!ready) return null;

  return (
    <PortalShell
      portal="teveta"
      active="certification"
      title="TEVETA Portal – Certification Records"
      subtitle="Sector-wide register of TEVET credentials issued by accredited providers. TEVETA monitors — issuance stays with the providers."
      actions={
        <ToolButton icon="download" onClick={() => exportCSV("tevet-certification-records", csvCols, rows)}>
          Export Records
        </ToolButton>
      }
      panel={selected ? <DetailPanel rec={selected} onClose={() => setSel(null)} /> : null}
      panelKey={selected?.credentialHash}
      panelWidth="w-[400px]"
    >
      <StatRow cols={5}>
        <StatCard icon="file" iconTone="softblue" label="Total Records" value={String(creds.length)} sub="Latest 200 shown" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Active" value={String(active)} sub="Lifecycle status: active" />
        <StatCard icon="shieldCheck" iconTone="purple" label="ZAQA Validated" value={String(validated)} sub="Nationally validated" />
        <StatCard icon="alert" iconTone="amber" label="Flagged / Disputed" value={String(flagged)} sub="Needs regulator attention" />
        <StatCard icon="revoke" iconTone="softred" label="Revoked" value={String(revoked)} sub="On-chain revocations" />
      </StatRow>

      <ErrorBanner error={error} onRetry={load} />

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs tabs={tabs} active={tab} onChange={setTab} variant="pill" />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox
            className="w-full sm:w-96"
            placeholder="Search by learner, qualification, provider, hash..."
            value={q}
            onChange={setQ}
          />
          <ToolButton icon="refresh" className="ml-auto" onClick={load} aria-label="Refresh" />
        </div>
        <DataTable
          rowKey="credentialHash"
          activeKey={selected?.credentialHash}
          onRowClick={(r) => setSel(r.credentialHash)}
          loading={loading}
          emptyText="No certification records match this filter."
          columns={[
            {
              key: "subjectName", label: "Learner",
              render: (r) => (
                <span className="block leading-tight">
                  <span className="block font-semibold text-slate-800">{r.subjectName || "—"}</span>
                  <span className="block text-[11px] text-slate-400">{shortHash(r.credentialHash)}</span>
                </span>
              ),
            },
            { key: "qualification", label: "Qualification" },
            { key: "institution", label: "Provider", render: (r) => r.institution || "—" },
            {
              key: "zqfLevel", label: "NQF Level",
              render: (r) => (r.zqfLevel != null ? <Badge tone="blue">Level {r.zqfLevel}</Badge> : "—"),
            },
            {
              key: "status", label: "Status",
              render: (r) => {
                const m = SMETA[r.status] || { label: r.status || "—", tone: "slate" };
                return <Badge tone={m.tone}>{m.label}</Badge>;
              },
            },
            {
              key: "zaqaValidation", label: "ZAQA State",
              render: (r) => {
                const m = VMETA[r.zaqaValidation || "draft"] || VMETA.draft;
                return <Badge tone={m.tone}>{m.label}</Badge>;
              },
            },
            { key: "issuedAt", label: "Issued", render: (r) => fmtDate(r.issuedAt) },
          ]}
          rows={pg.rows}
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>
    </PortalShell>
  );
}
