"use client";

// ZAQA national oversight dashboard — everything on this page is computed from
// live API data (zaqaOverview + the national validation queue). No sample series.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, StatCard, StatRow, SectionCard, DataTable, ErrorBanner, KVRow,
} from "../../../../components/portal/kit";
import { Donut, Legend, CHART } from "../../../../components/portal/charts";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const STATE_META = {
  pending: { label: "Pending review", tone: "blue", color: CHART.blue },
  validated: { label: "Validated", tone: "green", color: CHART.green },
  rejected: { label: "Rejected", tone: "red", color: CHART.red },
  suspicious: { label: "Returned / suspicious", tone: "amber", color: CHART.amber },
  suspended: { label: "Suspended", tone: "orange", color: CHART.orange },
  under_dispute: { label: "Under dispute", tone: "purple", color: CHART.purple },
};

const ROLE_LABEL = {
  admin: "Platform admins", zaqa: "ZAQA officers", hea: "HEA officers",
  teveta: "TEVETA officers", ecz: "ECZ officers", issuer: "Institution officers",
  holder: "Graduates",
};

const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-4)}` : "—");

export default function ZaqaDashboardPage() {
  const { ready, token } = usePortalGuard(["zaqa"]);
  const [overview, setOverview] = useState(null);
  const [creds, setCreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, val] = await Promise.all([
        api.zaqaOverview(token),
        api.zaqaValidationList(token),
      ]);
      setOverview(ov);
      setCreds(val.credentials || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (!ready) return null;

  const totals = overview?.totals || {};
  const roleCounts = overview?.roleCounts || {};
  const accounts = Object.values(roleCounts).reduce((s, n) => s + n, 0);

  const stateCounts = {};
  for (const c of creds) stateCounts[c.zaqaValidation] = (stateCounts[c.zaqaValidation] || 0) + 1;
  const pendingCount = stateCounts.pending || 0;

  const segments = Object.entries(stateCounts)
    .filter(([, v]) => v > 0)
    .map(([k, value]) => ({
      label: STATE_META[k]?.label || k,
      value,
      color: STATE_META[k]?.color || CHART.slate,
    }));

  const recent = [...creds]
    .sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0))
    .slice(0, 10);

  return (
    <PortalShell
      portal="zaqa"
      active="dashboard"
      title="National Oversight Dashboard"
      subtitle="Live view of the national credential ecosystem: institutions, credentials, validation states and platform accounts."
    >
      <ErrorBanner error={error} onRetry={load} />

      <StatRow cols={5}>
        <StatCard
          icon="bank" iconTone="softblue" label="Registered Institutions"
          value={loading ? "…" : String(totals.institutions ?? 0)}
          sub={loading ? "" : `${totals.higherEd ?? 0} higher ed · ${totals.tevet ?? 0} TEVET · ${totals.secondary ?? 0} secondary`}
        />
        <StatCard
          icon="file" iconTone="purple" label="Credentials Issued"
          value={loading ? "…" : String(totals.credentials ?? 0)}
          sub="Anchored on-chain"
        />
        <StatCard
          icon="checkCircle" iconTone="softgreen" label="Nationally Validated"
          value={loading ? "…" : String(totals.validated ?? 0)}
          sub="Carry a ZAQA reference"
        />
        <StatCard
          icon="queue" iconTone="amber" label="Pending Review"
          value={loading ? "…" : String(pendingCount)}
          sub="In the validation queue"
        />
        <StatCard
          icon="users" iconTone="softblue" label="Platform Accounts"
          value={loading ? "…" : String(accounts)}
          sub="Across all roles"
        />
      </StatRow>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Validation States" pad="p-4">
          {segments.length ? (
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <Donut
                segments={segments}
                size={150}
                thickness={20}
                centerTitle={String(creds.length)}
                centerSub="Submitted"
              />
              <Legend
                className="min-w-0 flex-1"
                items={segments.map((s) => ({
                  label: s.label,
                  color: s.color,
                  value: `${s.value} (${creds.length ? ((s.value / creds.length) * 100).toFixed(1) : 0}%)`,
                }))}
              />
            </div>
          ) : (
            <div className="py-10 text-center text-[13px] text-slate-400">
              {loading ? "Loading…" : "No credentials submitted to ZAQA yet."}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Accounts by Role" pad="p-4">
          {Object.keys(roleCounts).length ? (
            <div className="divide-y divide-slate-100">
              {Object.entries(roleCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([role, n]) => (
                  <KVRow
                    key={role}
                    label={ROLE_LABEL[role] || role}
                    value={<Badge tone="slate">{n}</Badge>}
                  />
                ))}
            </div>
          ) : (
            <div className="py-10 text-center text-[13px] text-slate-400">
              {loading ? "Loading…" : "No account data available."}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Recent Submissions"
        pad="p-0"
        action={
          <Link href="/zaqa/validation" className="text-[12px] font-semibold text-blue-600 hover:underline">
            Open validation queue →
          </Link>
        }
      >
        <DataTable
          dense
          loading={loading}
          rowKey="credentialHash"
          emptyText="No credentials submitted to ZAQA yet."
          columns={[
            {
              key: "credentialHash", label: "Credential",
              render: (r) => <span className="font-mono text-[12px] font-semibold text-blue-600">{shortHash(r.credentialHash)}</span>,
            },
            { key: "subjectName", label: "Holder", render: (r) => r.subjectName || "—" },
            { key: "institution", label: "Institution", render: (r) => r.institution || "—" },
            { key: "qualification", label: "Qualification", render: (r) => r.qualification || "—" },
            {
              key: "zaqaValidation", label: "State",
              render: (r) => {
                const m = STATE_META[r.zaqaValidation] || { label: r.zaqaValidation || "—", tone: "slate" };
                return <Badge tone={m.tone} dot>{m.label}</Badge>;
              },
            },
            { key: "issuedAt", label: "Submitted", render: (r) => fmtDate(r.issuedAt) },
            {
              key: "open", label: "",
              render: (r) => (
                <Link
                  href={`/zaqa/validation?hash=${r.credentialHash}`}
                  className="whitespace-nowrap text-[12px] font-semibold text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Open in validation queue
                </Link>
              ),
            },
          ]}
          rows={recent}
        />
      </SectionCard>
    </PortalShell>
  );
}
