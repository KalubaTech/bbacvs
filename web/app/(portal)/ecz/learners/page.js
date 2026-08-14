"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SelectPill, SearchBox,
  ToolButton, DataTable, Pagination, usePager, KVGrid, PanelHeader,
  ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";

// Credential / ZAQA states → certificate + sync badges.
const CERT_META = {
  active: { label: "Certificate Issued", tone: "green" },
  pending: { label: "Certificate Pending", tone: "amber" },
  revoked: { label: "Revoked", tone: "red" },
  superseded: { label: "Superseded", tone: "slate" },
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

// One row per learner: credentials grouped by holder identity.
const learnerKey = (c) => c.holderDID || c.holderNationalId || c.subjectName || c.credentialHash;

function DetailPanel({ learner, onClose }) {
  const latest = learner.credentials[0];
  return (
    <div>
      <PanelHeader
        title="Learner Record"
        badge={learner.holderDID ? <Badge tone="green">Verified Identity</Badge> : <Badge tone="slate">No DID</Badge>}
        onClose={onClose}
      />

      <div className="mb-4 flex items-start gap-3">
        <Avatar name={learner.name || "?"} size="h-12 w-12" />
        <div className="min-w-0 leading-tight">
          <div className="text-[15px] font-bold text-slate-900">{learner.name}</div>
          <div className="mt-0.5 text-[12px] text-slate-500">NRC: {learner.nrc || "—"}</div>
          <div className="break-all text-[12px] text-slate-500">DID: {learner.holderDID || "—"}</div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <KVGrid
          cols={2}
          items={[
            { label: "Credentials", value: learner.credentials.length },
            { label: "Latest Award", value: fmtDate(latest?.issuedAt) },
            { label: "Latest Qualification", value: latest?.qualification || "—" },
            { label: "School", value: latest?.institution || "—" },
          ]}
        />
      </div>

      <SectionCard title={`Credentials (${learner.credentials.length})`} pad="p-0">
        <div className="divide-y divide-slate-100">
          {learner.credentials.map((c) => {
            const cm = CERT_META[c.status] || { label: c.status, tone: "slate" };
            const sm = SYNC_META[c.zaqaValidation || "draft"] || { label: c.zaqaValidation, tone: "slate" };
            return (
              <div key={c.credentialHash} className="px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 leading-tight">
                    <div className="text-[12.5px] font-semibold text-slate-800">
                      {c.qualification}
                      {c.graduationYear ? ` · ${c.graduationYear}` : ""}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] font-mono text-slate-400">{c.credentialHash?.slice(0, 20)}…</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">Issued {fmtDate(c.issuedAt)}</div>
                  </div>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={cm.tone}>{cm.label}</Badge>
                    <Badge tone={sm.tone}>{sm.label}</Badge>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

export default function EczLearnersPage() {
  const { ready, token } = usePortalGuard(["ecz"]);
  const [q, setQ] = useState("");
  const [year, setYear] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sel, setSel] = useState(null);
  const [creds, setCreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.myIssued(token);
      setCreds(res.credentials || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  // Group credentials into one row per learner (newest credential first).
  const learners = useMemo(() => {
    const byKey = new Map();
    for (const c of creds) {
      const k = learnerKey(c);
      if (!byKey.has(k)) {
        byKey.set(k, {
          key: k,
          name: c.subjectName || "—",
          nrc: c.holderNationalId || "",
          holderDID: c.holderDID || "",
          credentials: [],
        });
      }
      const l = byKey.get(k);
      l.credentials.push(c);
      if (!l.nrc && c.holderNationalId) l.nrc = c.holderNationalId;
      if (!l.holderDID && c.holderDID) l.holderDID = c.holderDID;
    }
    for (const l of byKey.values()) {
      l.credentials.sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0));
      l.latest = l.credentials[0];
    }
    return [...byKey.values()];
  }, [creds]);

  const years = useMemo(
    () => [...new Set(creds.map((c) => c.graduationYear).filter(Boolean))].sort().reverse().map(String),
    [creds]
  );

  const rows = learners.filter((l) => {
    if (year && !l.credentials.some((c) => String(c.graduationYear) === year)) return false;
    if (statusFilter && !l.credentials.some((c) => c.status === statusFilter)) return false;
    return (
      !q ||
      `${l.name} ${l.nrc} ${l.holderDID} ${l.credentials.map((c) => c.qualification).join(" ")}`
        .toLowerCase()
        .includes(q.toLowerCase())
    );
  });
  const pg = usePager(rows, 10, [q, year, statusFilter]);
  const selected = learners.find((l) => l.key === sel) || null;

  const withDid = learners.filter((l) => l.holderDID).length;
  const missingNrc = learners.filter((l) => !l.nrc).length;
  const withActive = learners.filter((l) => l.credentials.some((c) => c.status === "active")).length;

  const csvCols = [
    { key: "name", label: "Learner" },
    { key: "nrc", label: "NRC", csv: (r) => r.nrc || "" },
    { key: "holderDID", label: "DID", csv: (r) => r.holderDID || "" },
    { key: "count", label: "Credentials", csv: (r) => r.credentials.length },
    { key: "latestQualification", label: "Latest Qualification", csv: (r) => r.latest?.qualification || "" },
    { key: "latestYear", label: "Latest Exam Year", csv: (r) => r.latest?.graduationYear || "" },
    { key: "latestIssued", label: "Latest Issued", csv: (r) => fmtDate(r.latest?.issuedAt) },
  ];

  if (!ready) return null;

  return (
    <PortalShell
      portal="ecz"
      active="learners"
      title="ECZ Portal – Learner Records"
      subtitle="One record per learner, derived from ECZ-issued certificates — identity, credential count and ZAQA sync state."
      panel={selected ? <DetailPanel learner={selected} onClose={() => setSel(null)} /> : null}
      panelKey={selected?.key}
      panelWidth="w-[380px]"
    >
      <StatRow cols={5}>
        <StatCard icon="users" iconTone="softgreen" label="Learners" value={String(learners.length)} sub="Distinct certificate holders" />
        <StatCard icon="file" iconTone="softblue" label="Certificates" value={String(creds.length)} sub="All ECZ-issued records" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Verified Identities" value={String(withDid)} sub={learners.length ? `${((withDid / learners.length) * 100).toFixed(1)}% with DID` : "—"} />
        <StatCard icon="shieldCheck" iconTone="purple" label="With Active Certificate" value={String(withActive)} sub="At least one active record" />
        <StatCard icon="alertCircle" iconTone="amber" label="Missing NRC" value={String(missingNrc)} sub="Identity data incomplete" />
      </StatRow>

      <ErrorBanner error={error} onRetry={load} />

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-full sm:w-96" placeholder="Search NRC, name, DID, qualification..." value={q} onChange={setQ} />
          <SelectPill label="Exam Year" value={year} onChange={setYear} options={years} />
          <SelectPill
            label="Certificate Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "active", label: "Issued" },
              { value: "pending", label: "Pending" },
              { value: "revoked", label: "Revoked" },
            ]}
          />
          <div className="ml-auto flex items-center gap-2.5">
            <ToolButton icon="download" onClick={() => exportCSV("ecz-learner-records", csvCols, rows)}>Export</ToolButton>
            <ToolButton icon="refresh" onClick={load} aria-label="Refresh" />
          </div>
        </div>
        <DataTable
          rowKey="key"
          activeKey={selected?.key}
          onRowClick={(r) => setSel(r.key)}
          loading={loading}
          emptyText="No learners match this filter."
          columns={[
            {
              key: "name", label: "Learner",
              render: (r) => (
                <span className="flex items-center gap-2">
                  <Avatar name={r.name} size="h-7 w-7" />
                  <span className="block leading-tight">
                    <span className="block font-medium text-slate-700">{r.name}</span>
                    <span className="block text-[11px] text-slate-400">NRC: {r.nrc || "—"}</span>
                  </span>
                </span>
              ),
            },
            {
              key: "identity", label: "Identity",
              render: (r) =>
                r.holderDID ? <Badge tone="green" icon="check">Verified</Badge> : <Badge tone="slate">No DID</Badge>,
            },
            {
              key: "count", label: "Credentials",
              render: (r) => <Badge tone="blue">{r.credentials.length}</Badge>,
            },
            {
              key: "latest", label: "Latest Credential",
              render: (r) => (
                <span className="block leading-tight">
                  <span className="block text-slate-700">{r.latest?.qualification || "—"}</span>
                  <span className="block text-[11px] text-slate-400">
                    {r.latest?.graduationYear ? `Exam ${r.latest.graduationYear} · ` : ""}Issued {fmtDate(r.latest?.issuedAt)}
                  </span>
                </span>
              ),
            },
            {
              key: "cert", label: "Certificate Status",
              render: (r) => {
                const m = CERT_META[r.latest?.status] || { label: r.latest?.status || "—", tone: "slate" };
                return <Badge tone={m.tone}>{m.label}</Badge>;
              },
            },
            {
              key: "sync", label: "ZAQA Sync",
              render: (r) => {
                const m = SYNC_META[r.latest?.zaqaValidation || "draft"] || { label: "—", tone: "slate" };
                return <Badge tone={m.tone}>{m.label}</Badge>;
              },
            },
          ]}
          rows={pg.rows}
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>
    </PortalShell>
  );
}
