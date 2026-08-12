"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/portal/shell";
import Icon from "../../../components/portal/icons";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SelectPill, SearchBox, ToolButton,
  DataTable, Pagination, ActionBtn,
} from "../../../components/portal/kit";
import { CHART, Donut } from "../../../components/portal/charts";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../components/portal/auth";
import { api, openBlob } from "../../../lib/api";

// Map credential state onto the design's status badges.
function credStatus(c) {
  if (c.status === "revoked") return { label: "Revoked", tone: "red" };
  if (c.zaqaValidation === "validated") return { label: "Verified", tone: "green" };
  if (c.zaqaValidation === "rejected") return { label: "Rejected", tone: "red" };
  if (["suspicious", "under_dispute", "suspended"].includes(c.zaqaValidation)) return { label: "Attention", tone: "amber" };
  return { label: "Pending", tone: "amber" };
}

const QUICK_ACTIONS = [
  { icon: "eye", title: "View Credential", sub: "View full details" },
  { icon: "share", title: "Share Secure Link", sub: "Share with employers" },
  { icon: "download", title: "Download PDF", sub: "Get official PDF" },
  { icon: "edit", title: "Request Correction", sub: "Report an issue" },
];

function ProfilePanel({ user, creds }) {
  const first = creds[0];
  // Real activity derived from credential issue / validation timestamps.
  const activity = creds
    .flatMap((c) => [
      { icon: "award", cls: "bg-blue-100 text-blue-600", title: "Credential Issued", sub: c.qualification, ts: c.issuedAt },
      ...(c.zaqaValidatedAt
        ? [{ icon: "check", cls: "bg-emerald-100 text-emerald-600", title: "ZAQA Validated", sub: c.qualification, ts: c.zaqaValidatedAt }]
        : []),
    ])
    .filter((a) => a.ts)
    .sort((x, y) => new Date(y.ts) - new Date(x.ts))
    .slice(0, 4);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-slate-900">Graduate Profile</h2>
        <button className="flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:underline">
          <Icon name="edit" className="h-3.5 w-3.5" />
          Edit Profile
        </button>
      </div>

      <div className="mb-4 flex flex-col items-center rounded-xl border border-slate-200 p-4 text-center">
        <Avatar name={user.name || user.email} size="h-14 w-14" className="text-[16px]" />
        <div className="mt-2 text-[14px] font-bold text-slate-900">{user.name || user.email}</div>
        {creds.some((c) => c.zaqaValidation === "validated") ? (
          <Badge tone="green" icon="shieldCheck" className="mt-1.5">Verified Graduate</Badge>
        ) : (
          <Badge tone="amber" icon="clock" className="mt-1.5">Verification Pending</Badge>
        )}
        <div className="mt-3 space-y-1 text-[12px] text-slate-600">
          {first ? (
            <>
              <div className="font-semibold text-slate-800">{first.credentialHash?.slice(0, 14)}…</div>
              <div>NRC: {first.holderNationalId || "—"}</div>
              <div>Latest: {first.qualification}</div>
            </>
          ) : (
            <div className="text-slate-400">No credentials on record yet.</div>
          )}
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <div className="mb-2 text-[12.5px] font-bold text-slate-800">Contact Information</div>
        <div className="space-y-1.5 text-[12px] text-slate-600">
          <div className="flex items-center gap-2">
            <Icon name="send" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {user.email}
          </div>
          {first && (
            <div className="flex items-center gap-2">
              <Icon name="map" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              {first.institution}
            </div>
          )}
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 text-[13px] font-bold text-slate-900">Quick Actions</div>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((q) => (
            <button
              key={q.title}
              className="flex flex-col items-start gap-1 rounded-lg border border-slate-200 p-2.5 text-left hover:bg-slate-50"
            >
              <Icon name={q.icon} className="h-4 w-4 text-emerald-600" />
              <span className="text-[11.5px] font-bold text-slate-800">{q.title}</span>
              <span className="text-[10.5px] text-slate-400">{q.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[13px] font-bold text-slate-900">Recent Activity</div>
          <button className="text-[11.5px] font-semibold text-blue-600 hover:underline">View All</button>
        </div>
        <div className="space-y-3">
          {activity.map((a, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${a.cls}`}>
                <Icon name={a.icon} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-[12.5px] font-semibold text-slate-800">{a.title}</div>
                <div className="mt-0.5 text-[11.5px] text-slate-500">{a.sub}</div>
                <div className="mt-0.5 text-[10.5px] text-slate-400">{fmtDateTime(a.ts)}</div>
              </div>
            </div>
          ))}
          {activity.length === 0 && (
            <p className="text-[12px] text-slate-400">No activity yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GraduateDashboardPage() {
  const { ready, user, token } = usePortalGuard(["holder"]);
  const [creds, setCreds] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      setCreds((await api.myCredentials(token)).credentials || []);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function onDownload(hash) {
    setBusy(hash);
    try { openBlob(await api.downloadPDF(token, hash), `credential-${hash.slice(0, 10)}.pdf`); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  if (!ready) return null;

  const verified = creds.filter((c) => c.zaqaValidation === "validated").length;
  const attention = creds.filter(
    (c) => c.status === "revoked" || ["rejected", "suspicious", "under_dispute", "suspended"].includes(c.zaqaValidation)
  ).length;
  const pending = creds.length - verified - attention;
  const pct = (n) => (creds.length ? `${((n / creds.length) * 100).toFixed(1)}%` : "0%");

  const kpis = [
    { icon: "file", iconTone: "softblue", label: "Total Credentials", value: String(creds.length), sub: "All time issued" },
    { icon: "shieldCheck", iconTone: "softgreen", label: "Verified Credentials", value: String(verified), sub: "ZAQA validated" },
    { icon: "clock", iconTone: "amber", label: "Pending Verification", value: String(pending), sub: "Awaiting ZAQA" },
    { icon: "alert", iconTone: "softred", label: "Requires Attention", value: String(attention), sub: "Flagged or rejected" },
  ];

  const statusSummary = [
    { icon: "check", cls: "bg-emerald-500/20 text-emerald-300", count: verified, label: "Verified", pct: pct(verified) },
    { icon: "clock", cls: "bg-amber-500/20 text-amber-300", count: pending, label: "Pending Verification", pct: pct(pending) },
    { icon: "alert", cls: "bg-orange-500/20 text-orange-300", count: attention, label: "Requires Attention", pct: pct(attention) },
    { icon: "x", cls: "bg-red-500/20 text-red-300", count: creds.filter((c) => c.status === "revoked").length, label: "Revoked", pct: pct(creds.filter((c) => c.status === "revoked").length) },
  ];

  const rows = creds.filter(
    (c) => !q || `${c.credentialHash} ${c.qualification} ${c.institution}`.toLowerCase().includes(q.toLowerCase())
  );

  const firstName = (user.name || user.email || "").split(/[\s@]/)[0];

  return (
    <PortalShell
      portal="graduate"
      active="dashboard"
      title={`Welcome back, ${firstName}!`}
      subtitle="Here's what's happening with your academic credentials."
      user={{ name: user.name || user.email, sub: user.email }}
      panel={<ProfilePanel user={user} creds={creds} />}
      panelWidth="w-[380px]"
    >
      {/* KPI row */}
      <StatRow cols={5}>
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="flex items-center gap-3">
            <Donut
              size={64}
              thickness={8}
              segments={[
                { value: 85, color: CHART.green, label: "Complete" },
                { value: 15, color: "#e2e8f0", label: "Missing" },
              ]}
              centerTitle={<span className="text-[13px] font-bold text-slate-900">85%</span>}
            />
            <div className="min-w-0 leading-tight">
              <div className="text-xs font-medium text-slate-500">Profile Completeness</div>
              <div className="mt-1 text-[11px] text-slate-400">Complete your profile</div>
              <button className="mt-1 text-[11px] font-semibold text-emerald-600 hover:underline">
                Add missing info →
              </button>
            </div>
          </div>
        </div>
      </StatRow>

      {/* Hero banner */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-gradient-to-r from-[#0c3b2e] to-[#14532d] p-6 text-white">
        <div className="flex max-w-md items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <Icon name="wallet" className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-lg font-bold">Your Credential Wallet</h3>
            <p className="mt-1 text-[13px] text-emerald-100/80">
              Store, manage, and share your academic credentials securely.
            </p>
            <Link href="/student/classic">
              <ActionBtn tone="green" className="mt-3">View All Credentials →</ActionBtn>
            </Link>
          </div>
        </div>
        <div>
          <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-emerald-100/70">
            Credential Status Summary
          </div>
          <div className="flex gap-6">
            {statusSummary.map((s) => (
              <div key={s.label} className="flex w-24 flex-col items-center text-center">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.cls}`}>
                  <Icon name={s.icon} className="h-4 w-4" />
                </span>
                <div className="mt-1.5 text-xl font-bold">{s.count}</div>
                <div className="text-[10.5px] leading-tight text-emerald-100/80">{s.label}</div>
                <div className="text-[10.5px] text-emerald-100/50">{s.pct}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Credentials table */}
      <SectionCard
        title="My Credentials"
        pad="p-0"
        action={
          <div className="flex items-center gap-2">
            <SelectPill label="All Credentials" />
            <SearchBox className="w-56" placeholder="Search credentials..." value={q} onChange={setQ} />
            <ToolButton icon="filter" aria-label="Filter" />
          </div>
        }
      >
        {error && <p className="px-4 pt-3 text-[12px] font-medium text-red-600">{error}</p>}
        {rows.length ? (
          <DataTable
            rowKey="credentialHash"
            columns={[
              {
                key: "credentialHash",
                label: "Credential",
                render: (r) => (
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <Icon name="award" className="h-4 w-4" />
                    </span>
                    <span className="leading-tight">
                      <span className="block font-bold text-slate-800">{r.credentialHash.slice(0, 14)}…</span>
                      <span className="block text-[11px] text-slate-400">Credential Hash</span>
                    </span>
                  </span>
                ),
              },
              {
                key: "qualification",
                label: "Qualification",
                render: (r) => (
                  <span className="block leading-tight">
                    <span className="block font-medium text-slate-700">{r.qualification}</span>
                    <span className="block text-[11px] text-slate-400">{r.graduationYear}</span>
                  </span>
                ),
              },
              { key: "institution", label: "Issuer" },
              { key: "issued", label: "Issue Date", tdClass: "whitespace-nowrap", render: (r) => fmtDate(r.issuedAt) },
              {
                key: "status",
                label: "Status",
                render: (r) => {
                  const s = credStatus(r);
                  return <Badge tone={s.tone}>{s.label}</Badge>;
                },
              },
              {
                key: "actions",
                label: "Actions",
                render: (r) => (
                  <span className="flex items-center gap-2.5 text-slate-400">
                    <Link href={`/verify?hash=${r.credentialHash}`} aria-label="Verify credential">
                      <Icon name="eye" className="h-4 w-4 hover:text-slate-600" />
                    </Link>
                    <Icon name="share" className="h-4 w-4 hover:text-slate-600" />
                    <button
                      onClick={() => onDownload(r.credentialHash)}
                      disabled={busy === r.credentialHash}
                      aria-label="Download PDF"
                      className="disabled:opacity-40"
                    >
                      <Icon name="download" className="h-4 w-4 hover:text-slate-600" />
                    </button>
                  </span>
                ),
              },
            ]}
            rows={rows}
          />
        ) : (
          <div className="px-4 py-10 text-center text-[13px] text-slate-400">No records yet.</div>
        )}
        <Pagination
          className="border-t border-slate-100"
          summary={`Showing ${rows.length ? 1 : 0} to ${rows.length} of ${creds.length} credentials`}
          page={1}
          pages={1}
        />
      </SectionCard>

      {/* Security note */}
      <div className="mt-6 text-center text-[12px] text-slate-500">
        <Icon name="lock" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        Your credentials are secured with bank-level encryption and tamper-proof verification.
      </div>
    </PortalShell>
  );
}
