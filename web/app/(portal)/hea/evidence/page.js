"use client";

import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, StatCard, StatRow, SectionCard, StatusTabs, SearchBox,
  ToolButton, DataTable, Pagination, usePager, KVGrid,
  PanelHeader, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const VALIDATION_LABEL = {
  draft: "Draft",
  pending: "Pending",
  validated: "Validated",
  rejected: "Rejected",
  suspicious: "Suspicious",
  suspended: "Suspended",
  under_dispute: "Under Dispute",
};
const VALIDATION_TONE = {
  draft: "slate",
  pending: "amber",
  validated: "green",
  rejected: "red",
  suspicious: "orange",
  suspended: "purple",
  under_dispute: "blue",
};
const STATUS_TONE = { pending: "amber", active: "green", suspended: "orange", revoked: "red" };

// On-chain RevocationRegistry.ReasonCode enum.
const REASON_CODE = {
  1: "Administrative error",
  2: "Fraud detected",
  3: "Regulatory action",
  4: "Holder request",
  5: "Other",
};

const TAB_KEYS = ["pending", "validated", "rejected", "suspicious", "suspended", "under_dispute"];

const shortHash = (h) => (h && h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h || "—");

function DetailPanel({ cred, onClose }) {
  return (
    <div>
      <PanelHeader
        title="Credential Evidence"
        badge={
          <Badge tone={VALIDATION_TONE[cred.zaqaValidation] || "slate"}>
            {VALIDATION_LABEL[cred.zaqaValidation] || cred.zaqaValidation || "—"}
          </Badge>
        }
        onClose={onClose}
      />

      <SectionCard title="Credential Facts" className="mb-4" pad="p-4">
        <KVGrid
          cols={2}
          items={[
            { label: "Graduate", value: cred.subjectName || "—" },
            { label: "Qualification", value: cred.qualification || "—" },
            { label: "Institution", value: cred.institution || "—" },
            { label: "Credential Type", value: cred.credentialType || "—" },
            { label: "NQF Level", value: cred.zqfLevel || "—" },
            { label: "Lifecycle Status", value: <Badge tone={STATUS_TONE[cred.status] || "slate"}>{cred.status || "—"}</Badge> },
            { label: "ZAQA Validation", value: VALIDATION_LABEL[cred.zaqaValidation] || cred.zaqaValidation || "—" },
            { label: "ZAQA Reference", value: cred.zaqaRef || "—" },
            { label: "Issued", value: fmtDate(cred.issuedAt) },
            {
              label: "Revocation Reason",
              value: cred.reasonCode ? REASON_CODE[cred.reasonCode] || `Code ${cred.reasonCode}` : "—",
            },
          ]}
        />
      </SectionCard>

      {cred.suspension?.suspendedAt && (
        <SectionCard title="Suspension" className="mb-4" pad="p-4">
          <KVGrid
            cols={2}
            items={[
              { label: "Suspended At", value: fmtDateTime(cred.suspension.suspendedAt) },
              { label: "Suspended By", value: cred.suspension.suspendedBy || "—" },
              { label: "Reason", value: cred.suspension.reason || "—" },
              {
                label: "Reinstated",
                value: cred.suspension.reinstatedAt
                  ? `${fmtDateTime(cred.suspension.reinstatedAt)} by ${cred.suspension.reinstatedBy || "—"}`
                  : "No",
              },
            ]}
          />
        </SectionCard>
      )}

      {cred.supersededBy && (
        <SectionCard title="Supersession" className="mb-4" pad="p-4">
          <p className="text-[12.5px] leading-relaxed text-slate-600">
            This credential was superseded by a corrected reissue — the holder now carries the replacement credential.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Audit Trail" pad="p-4">
        <CaseTimeline events={cred.events} />
      </SectionCard>
    </div>
  );
}

export default function HeaEvidencePage() {
  const { ready, token } = usePortalGuard(["hea"]);
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(undefined);
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.heaCredentials(token);
      setCredentials(r.credentials || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);


  const counts = credentials.reduce((m, c) => {
    m[c.zaqaValidation || "draft"] = (m[c.zaqaValidation || "draft"] || 0) + 1;
    return m;
  }, {});

  const kpis = [
    { icon: "fileText", iconTone: "softblue", label: "HE Credentials Indexed", value: String(credentials.length) },
    { icon: "clock", iconTone: "amber", label: "Awaiting ZAQA Validation", value: String(counts.pending || 0) },
    { icon: "checkCircle", iconTone: "softgreen", label: "Nationally Validated", value: String(counts.validated || 0) },
    { icon: "alert", iconTone: "softred", label: "Flagged / Rejected", value: String((counts.suspicious || 0) + (counts.rejected || 0)) },
    { icon: "scale", iconTone: "purple", label: "Under Dispute", value: String(counts.under_dispute || 0) },
  ];

  const tabs = [
    { label: "All", count: credentials.length },
    ...TAB_KEYS.map((k) => ({ label: VALIDATION_LABEL[k], count: counts[k] || 0 })),
  ];
  const TAB_VALUE = Object.fromEntries(TAB_KEYS.map((k) => [VALIDATION_LABEL[k], k]));

  const rows = credentials.filter((r) => {
    if (tab !== "All" && (r.zaqaValidation || "draft") !== TAB_VALUE[tab]) return false;
    return (
      !q ||
      ((r.subjectName || "") + (r.qualification || "") + (r.institution || "") + (r.zaqaRef || "") + (r.credentialHash || ""))
        .toLowerCase()
        .includes(q.toLowerCase())
    );
  });
  const pager = usePager(rows, 10, [tab, q]);
  if (!ready) return null;
  const selected = sel === null ? null : credentials.find((r) => r.credentialHash === sel) || rows[0] || null;

  const columns = [
    { key: "subjectName", label: "Graduate", render: (r) => <span className="font-semibold text-slate-800">{r.subjectName || "—"}</span> },
    { key: "qualification", label: "Qualification", render: (r) => r.qualification || "—" },
    { key: "institution", label: "Institution", render: (r) => r.institution || "—" },
    { key: "zqfLevel", label: "NQF", tdClass: "text-center", thClass: "text-center", render: (r) => r.zqfLevel || "—" },
    {
      key: "status", label: "Status", csv: (r) => r.status || "",
      render: (r) => <Badge tone={STATUS_TONE[r.status] || "slate"}>{r.status || "—"}</Badge>,
    },
    {
      key: "zaqaValidation", label: "ZAQA Validation", csv: (r) => VALIDATION_LABEL[r.zaqaValidation] || r.zaqaValidation || "",
      render: (r) => (
        <Badge tone={VALIDATION_TONE[r.zaqaValidation] || "slate"}>
          {VALIDATION_LABEL[r.zaqaValidation] || r.zaqaValidation || "—"}
        </Badge>
      ),
    },
    { key: "zaqaRef", label: "ZAQA Ref", render: (r) => r.zaqaRef || "—" },
    { key: "issuedAt", label: "Issued", csv: (r) => fmtDate(r.issuedAt), render: (r) => fmtDate(r.issuedAt) },
    {
      key: "credentialHash", label: "Hash", csv: (r) => r.credentialHash,
      render: (r) => <span className="font-mono text-[11px]">{shortHash(r.credentialHash)}</span>,
    },
  ];

  return (
    <PortalShell
      portal="hea"
      active="evidence"
      title="HEA Portal – Evidence for ZAQA Validation"
      panel={
        selected ? (
          <DetailPanel key={selected.credentialHash} cred={selected} onClose={() => setSel(null)} />
        ) : (
          <div className="py-10 text-center text-[13px] text-slate-400">No credential selected.</div>
        )
      }
      panelKey={selected?.credentialHash}
      panelWidth="w-[440px]"
    >
      <StatRow cols={5}>
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </StatRow>

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs tabs={tabs} active={tab} onChange={setTab} />
        <ErrorBanner error={error} onRetry={load} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-72" placeholder="Search graduate, qualification, hash, ZAQA ref..." value={q} onChange={setQ} />
          <ToolButton icon="download" onClick={() => exportCSV("hea-zaqa-evidence", columns, rows)}>Export</ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load}>Refresh</ToolButton>
        </div>
        <DataTable
          rowKey="credentialHash"
          minWidth="min-w-[860px]"
          loading={loading}
          activeKey={selected?.credentialHash}
          onRowClick={(r) => setSel(r.credentialHash)}
          columns={columns}
          rows={pager.rows}
          emptyText="No higher-education credentials in this validation state."
          footer={<Pagination {...pager.props} className="border-t border-slate-100" />}
        />
      </div>
    </PortalShell>
  );
}
