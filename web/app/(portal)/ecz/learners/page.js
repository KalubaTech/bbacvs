"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SelectPill, SearchBox,
  ToolButton, DataTable, Pagination, ActionBtn, KVGrid, Timeline,
} from "../../../../components/portal/kit";

// Credential / ZAQA states → certificate + sync badges.
const CERT_META = {
  active: { label: "Certificate Issued", tone: "green" },
  pending: { label: "Certificate Pending", tone: "amber" },
  revoked: { label: "Revoked", tone: "red" },
};
const SYNC_META = {
  draft: { label: "Not Sent", tone: "slate" },
  pending: { label: "Pending", tone: "amber" },
  validated: { label: "Synced", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  suspicious: { label: "Flagged", tone: "orange" },
  suspended: { label: "Suspended", tone: "red" },
  under_dispute: { label: "Under Dispute", tone: "purple" },
};

const FILTERS = [
  { label: "Exam Year", value: "All Years" },
  { label: "Qualification Type", value: "All Types" },
  { label: "Province", value: "All Provinces" },
  { label: "School", value: "All Schools" },
  { label: "Status", value: "All Statuses" },
];

const QUICK_ACTIONS = [
  { icon: "file", label: "View Record", cls: "text-slate-600" },
  { icon: "link", label: "Link Certificate", cls: "text-slate-600" },
  { icon: "flag", label: "Flag Duplicate", cls: "text-red-600" },
  { icon: "send", label: "Send to ZAQA", cls: "text-emerald-600" },
];

function PanelLink({ children }) {
  return <button className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800">{children}</button>;
}

function DetailPanel({ cred, history }) {
  if (!cred) {
    return (
      <div className="py-10 text-center text-[13px] text-slate-400">No learner selected.</div>
    );
  }
  const timeline = [
    cred.zaqaValidatedAt && {
      title: "ZAQA validation completed", sub: "by ZAQA", time: fmtDateTime(cred.zaqaValidatedAt), state: "done",
    },
    cred.zaqaValidation && cred.zaqaValidation !== "draft" && {
      title: "Record sent to ZAQA", sub: "by ECZ", time: cred.zaqaValidatedAt ? "" : "Awaiting validation", state: cred.zaqaValidation === "pending" ? "current" : "done",
    },
    { title: "Certificate record created", sub: `by ${cred.institution || "ECZ"}`, time: fmtDateTime(cred.issuedAt), state: "done" },
  ].filter(Boolean);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={cred.subjectName || "?"} size="h-12 w-12" />
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-slate-900">{cred.subjectName}</span>
              {cred.holderDID && <Badge tone="green">Verified Identity</Badge>}
            </div>
            <div className="mt-0.5 text-[12px] text-slate-500">NRC: {cred.holderNationalId || "—"}</div>
            <div className="break-all text-[12px] text-slate-500">DID: {cred.holderDID || "—"}</div>
          </div>
        </div>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2">
        {QUICK_ACTIONS.map((a) => (
          <button key={a.label} className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 px-1 py-2.5 hover:bg-slate-50">
            <Icon name={a.icon} className={`h-4 w-4 ${a.cls}`} />
            <span className={`text-[10px] font-semibold leading-tight ${a.cls}`}>{a.label}</span>
          </button>
        ))}
      </div>

      <SectionCard title="Identity Details" action={<PanelLink>View Full</PanelLink>} className="mb-4">
        <KVGrid
          cols={2}
          items={[
            { label: "Full Name", value: cred.subjectName || "—" },
            { label: "NRC / National ID", value: cred.holderNationalId || "—" },
            { label: "Institution", value: cred.institution || "—" },
            { label: "Exam Year", value: cred.graduationYear || "—" },
            { label: "Qualification Type", value: cred.credentialType || "—" },
            { label: "ZQF Level", value: cred.zqfLevel ? `ZQF ${cred.zqfLevel}` : "—" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Exam History" action={<PanelLink>View All</PanelLink>} className="mb-4" pad="p-0">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {["Exam Year", "Qualification", "Status", "ZAQA"].map((h) => (
                <th key={h} className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((r) => (
              <tr key={r.credentialHash} className="border-b border-slate-50 last:border-0">
                <td className="px-3 py-2 text-[12px] text-slate-600">{r.graduationYear || "—"}</td>
                <td className="px-3 py-2 text-[12px] text-slate-600">{r.qualification}</td>
                <td className="px-3 py-2 text-[12px] text-slate-600">{CERT_META[r.status]?.label || r.status}</td>
                <td className="px-3 py-2 text-[12px] text-slate-600">{SYNC_META[r.zaqaValidation || "draft"]?.label || r.zaqaValidation}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-[12px] text-slate-400">No records yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title="Qualifications Earned" action={<PanelLink>View All</PanelLink>} className="mb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Icon name="registry" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-semibold text-slate-800">{cred.qualification}</span>
              {cred.zaqaValidation === "validated" && <Badge tone="green">Verified</Badge>}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              Awarded: {fmtDate(cred.issuedAt)}{cred.zaqaRef ? ` · ZAQA Ref: ${cred.zaqaRef}` : ""}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Linked Certificates" action={<PanelLink>View All</PanelLink>} className="mb-4">
        <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Icon name="file" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12.5px] font-medium text-slate-700">{cred.qualification} {cred.graduationYear || ""}</div>
            <div className="truncate text-[11px] text-slate-400">
              {cred.credentialHash?.slice(0, 18)}… — Issued: {fmtDate(cred.issuedAt)}
            </div>
          </div>
          <Badge tone={CERT_META[cred.status]?.tone || "slate"}>{cred.status}</Badge>
          <Icon name="download" className="h-4 w-4 shrink-0 text-slate-400" />
        </div>
      </SectionCard>

      <SectionCard title="Sync History to BBACVS" action={<PanelLink>View All</PanelLink>} className="mb-4">
        <Timeline items={timeline} />
      </SectionCard>

      <div className="space-y-0.5 text-[11px] text-slate-400">
        <div className="break-all">Record ID: {cred.credentialHash}</div>
        <div>Created: {fmtDateTime(cred.issuedAt)}</div>
        {cred.anchorTx && <div className="break-all">Anchor Tx: {cred.anchorTx}</div>}
      </div>
    </div>
  );
}

export default function EczLearnersPage() {
  const { ready, user, token } = usePortalGuard(["ecz"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [creds, setCreds] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.myIssued(token);
      setCreds(res.credentials || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (!ready) return null;

  const rows = creds.filter(
    (r) => !q ||
      ((r.holderNationalId || "") + (r.subjectName || "") + (r.institution || "") + (r.qualification || ""))
        .toLowerCase().includes(q.toLowerCase())
  );
  const selected = creds.find((c) => c.credentialHash === sel) || rows[0] || creds[0] || null;
  const history = selected
    ? creds.filter((c) => (c.holderDID && c.holderDID === selected.holderDID) || c.subjectName === selected.subjectName)
    : [];

  const withDid = creds.filter((c) => c.holderDID).length;
  const withCert = creds.filter((c) => c.status === "active").length;
  const revoked = creds.filter((c) => c.status === "revoked").length;
  const missingNrc = creds.filter((c) => !c.holderNationalId).length;

  return (
    <PortalShell
      portal="ecz"
      active="learners"
      title="ECZ Portal – Learner Records Repository"
      subtitle="Search, review and maintain candidate identity, results and qualification records used for BBACVS verification."
      user={{ name: user.name || user.email, sub: user.email }}
      panel={<DetailPanel cred={selected} history={history} />}
      panelWidth="w-[380px]"
    >
      <StatRow cols={5}>
        <StatCard icon="users" iconTone="softgreen" label="Total Learner Records" value={creds.length} sub="Certificates on record" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Verified Identities" value={withDid} sub={creds.length ? `${((withDid / creds.length) * 100).toFixed(1)}% of total` : "—"} />
        <StatCard icon="file" iconTone="softblue" label="Records With Certificates" value={withCert} sub={creds.length ? `${((withCert / creds.length) * 100).toFixed(1)}% of total` : "—"} />
        <StatCard icon="alert" iconTone="softred" label="Revoked Records" value={revoked} sub={creds.length ? `${((revoked / creds.length) * 100).toFixed(1)}% of total` : "—"} />
        <StatCard icon="alertCircle" iconTone="amber" label="Missing NRC" value={missingNrc} sub={creds.length ? `${((missingNrc / creds.length) * 100).toFixed(1)}% of total` : "—"} />
      </StatRow>

      {error && <div className="mb-3 text-[13px] font-medium text-red-600">{error}</div>}

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-end gap-3">
          {FILTERS.map((f) => (
            <div key={f.label} className="min-w-[130px]">
              <div className="mb-1 text-[11px] font-medium text-slate-400">{f.label}</div>
              <SelectPill label={f.value} className="w-full justify-between" />
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2.5">
            <ToolButton>Clear Filters</ToolButton>
            <ActionBtn tone="darkgreen">Apply Filters</ActionBtn>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-96" placeholder="Search NRC, name, school, qualification..." value={q} onChange={setQ} />
          <SelectPill label="Saved Views" />
          <SelectPill label="Columns" />
          <div className="ml-auto flex items-center gap-2.5">
            <ToolButton icon="download">Export</ToolButton>
            <ToolButton icon="refresh" onClick={load} />
          </div>
        </div>
        <DataTable
          rowKey="credentialHash"
          activeKey={selected?.credentialHash}
          onRowClick={(r) => setSel(r.credentialHash)}
          columns={[
            { key: "check", label: "", thClass: "w-8", render: () => <input type="checkbox" className="rounded border-slate-300" onClick={(e) => e.stopPropagation()} readOnly /> },
            { key: "nrc", label: "NRC", render: (r) => <span className="font-semibold text-emerald-700">{r.holderNationalId || "—"}</span> },
            { key: "did", label: "Holder DID", render: (r) => <span className="text-[11px] text-slate-400">{r.holderDID ? `${r.holderDID.slice(0, 18)}…` : "—"}</span> },
            {
              key: "name", label: "Learner Name",
              render: (r) => (
                <span className="flex items-center gap-1.5 font-medium text-slate-700">
                  {r.subjectName}
                  {r.credentialHash === selected?.credentialHash && <Icon name="check" className="h-3.5 w-3.5 text-emerald-500" strokeWidth={3} />}
                </span>
              ),
            },
            { key: "qualification", label: "Qualification" },
            { key: "year", label: "Exam Year", render: (r) => r.graduationYear || "—" },
            { key: "school", label: "School", render: (r) => r.institution || "—" },
            {
              key: "cert", label: "Certificate Status",
              render: (r) => {
                const m = CERT_META[r.status] || { label: r.status, tone: "slate" };
                return <Badge tone={m.tone}>{m.label}</Badge>;
              },
            },
            {
              key: "sync", label: "Sync Status",
              render: (r) => {
                const m = SYNC_META[r.zaqaValidation || "draft"] || { label: r.zaqaValidation, tone: "slate" };
                return <Badge tone={m.tone}>{m.label}</Badge>;
              },
            },
            { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
          ]}
          rows={rows}
          footer={
            rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-slate-400">No records yet.</div>
            ) : null
          }
        />
        <Pagination summary={`Showing ${rows.length} of ${creds.length} records`} page={1} pages={1} />
      </div>
    </PortalShell>
  );
}
