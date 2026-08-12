"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/portal/shell";
import Icon from "../../../components/portal/icons";
import {
  Badge, StatCard, StatRow, SectionCard, SelectPill, ToolButton, DataTable, TONES,
} from "../../../components/portal/kit";
import { CHART, Donut, Legend, LineChart } from "../../../components/portal/charts";
import { usePortalGuard, fmtDateTime } from "../../../components/portal/auth";
import { api } from "../../../lib/api";

const TREND_LABELS = ["24 Feb", "10 Mar", "24 Mar", "7 Apr", "21 Apr", "5 May", "19 May"];
const TREND_SERIES = [
  { label: "Records Submitted", color: CHART.blue, points: [55, 120, 150, 170, 140, 190, 160] },
  { label: "Records Accepted", color: CHART.blue, dashed: true, points: [48, 110, 145, 160, 130, 185, 150] },
];

// Map a credential's ZAQA validation state onto an activity status badge.
const CRED_STATUS = {
  draft: { label: "Draft", tone: "slate" },
  pending: { label: "Pending ZAQA Review", tone: "blue" },
  validated: { label: "ZAQA Validated", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  suspicious: { label: "Flagged", tone: "amber" },
  suspended: { label: "Suspended", tone: "red" },
  under_dispute: { label: "Disputed", tone: "amber" },
};
const APP_STATUS = {
  submitted: { label: "Pending Review", tone: "amber" },
  issued: { label: "Issued", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

const QUICK_ACTIONS = [
  { icon: "upload", label: "Submit Results", href: "/issuer/classic" },
  { icon: "award", label: "Issue Credential", href: "/issuer/classic" },
  { icon: "folder", label: "Upload Evidence", href: "/institution/evidence" },
  { icon: "search", label: "Verify Record", href: "/verify" },
];

function AlertsPanel({ pendingApps, drafts }) {
  const alerts = [
    {
      icon: "clock", iconTone: "amber", title: "Pending Verification Requests",
      level: pendingApps > 0 ? "High" : "Info", levelTone: pendingApps > 0 ? "red" : "slate",
      body: `You have ${pendingApps} verification request${pendingApps === 1 ? "" : "s"} awaiting your action.`,
      link: "Review requests →", href: "/issuer/classic",
    },
    {
      icon: "fileText", iconTone: "softblue", title: "Draft Credentials Not Submitted",
      level: drafts > 0 ? "Medium" : "Info", levelTone: drafts > 0 ? "amber" : "slate",
      body: `${drafts} issued credential${drafts === 1 ? "" : "s"} ${drafts === 1 ? "has" : "have"} not been submitted to ZAQA for validation.`,
      link: "Submit to ZAQA →", href: "/issuer/classic",
    },
    { icon: "refresh", iconTone: "purple", title: "Results Submission Incomplete", level: "Low", levelTone: "green", body: "2025 Grade 9 results for 2 subjects are not yet submitted.", link: "Continue submission →" },
    { icon: "checkCircle", iconTone: "green", title: "System Sync Healthy", level: "Info", levelTone: "slate", body: "All systems are operational." },
  ];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-[14px] font-bold text-slate-900">Institution Alerts & Actions</h2>
          <Badge tone="red">{alerts.length}</Badge>
        </div>
        <button className="shrink-0 text-[12px] font-semibold text-blue-600 hover:underline">View all</button>
      </div>

      <div className="space-y-3">
        {alerts.map((a) => (
          <div key={a.title} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-start gap-2.5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES[a.iconTone]}`}>
                <Icon name={a.icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[12.5px] font-semibold text-slate-800">{a.title}</div>
                  <Badge tone={a.levelTone}>{a.level}</Badge>
                </div>
                <div className="mt-1 text-[11.5px] leading-snug text-slate-500">{a.body}</div>
                {a.link && (a.href ? (
                  <Link href={a.href} className="mt-1.5 inline-block text-[11.5px] font-semibold text-blue-600 hover:underline">{a.link}</Link>
                ) : (
                  <button className="mt-1.5 text-[11.5px] font-semibold text-blue-600 hover:underline">{a.link}</button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-2 text-[13px] font-bold text-slate-900">Quick Actions</div>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_ACTIONS.map((q) => (
            <Link
              key={q.label}
              href={q.href}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-200 p-2.5 text-center hover:bg-slate-50"
            >
              <Icon name={q.icon} className="h-4 w-4 text-slate-500" />
              <span className="text-[10px] font-semibold leading-tight text-slate-600">{q.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function InstitutionDashboardPage() {
  const { ready, user, token } = usePortalGuard(["issuer"]);
  const [creds, setCreds] = useState([]);
  const [apps, setApps] = useState([]);
  const [profile, setProfile] = useState(null);
  const [programmes, setProgrammes] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      const [c, a, p, pr] = await Promise.all([
        api.myIssued(token),
        api.incomingApplications(token),
        api.issuerProfile(token).catch(() => null),
        api.myProgrammes(token).catch(() => ({ programmes: [] })),
      ]);
      setCreds(c.credentials || []);
      setApps(a.applications || []);
      setProfile(p);
      setProgrammes(pr.programmes || []);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  if (!ready) return null;

  const pendingApps = apps.filter((a) => a.status === "submitted").length;
  const drafts = creds.filter((c) => c.zaqaValidation === "draft").length;
  const flagged = creds.filter(
    (c) => c.correctionRequest?.status === "open" ||
      ["suspicious", "under_dispute", "rejected"].includes(c.zaqaValidation)
  ).length;
  const learners = new Set(creds.map((c) => c.holderDID || c.subjectName)).size;
  const submitted = creds.filter((c) => c.zaqaValidation && c.zaqaValidation !== "draft").length;

  const kpis = [
    { icon: "graduation", iconTone: "softblue", label: "Total Learners", value: String(learners), sub: "Unique credential holders" },
    { icon: "file", iconTone: "softgreen", label: "Submitted Records", value: String(submitted), sub: "Sent for ZAQA validation" },
    { icon: "clock", iconTone: "amber", label: "Pending Verification Requests", value: String(pendingApps), sub: "Awaiting your action" },
    { icon: "award", iconTone: "purple", label: "Credentials Issued", value: String(creds.length), sub: "All time" },
    { icon: "alert", iconTone: "softred", label: "Discrepancies Flagged", value: String(flagged), sub: "Corrections & ZAQA flags" },
  ];

  // Verification-request status distribution (real application statuses).
  const appCounts = apps.reduce((m, a) => ((m[a.status] = (m[a.status] || 0) + 1), m), {});
  const pct = (n) => (apps.length ? `${((n / apps.length) * 100).toFixed(1)}%` : "0%");
  const requestSegments = [
    { label: "Pending Institution Action", value: appCounts.submitted || 0, color: CHART.orange, pct: pct(appCounts.submitted || 0) },
    { label: "Verified & Issued", value: appCounts.issued || 0, color: CHART.green, pct: pct(appCounts.issued || 0) },
    { label: "Rejected", value: appCounts.rejected || 0, color: CHART.red, pct: pct(appCounts.rejected || 0) },
  ].filter((s) => s.value > 0);

  // Recent activity: credentials issued + verification requests received, newest first.
  const activities = [
    ...creds.map((c) => ({
      id: `cred-${c.credentialHash}`,
      ts: c.issuedAt,
      icon: "award", iconCls: "text-slate-400",
      activity: "Credential Issued",
      details: `${c.qualification} — ${c.subjectName}`,
      user: user?.name || user?.email || "—",
      ...(CRED_STATUS[c.zaqaValidation] || { label: c.zaqaValidation || c.status, tone: "slate" }),
    })),
    ...apps.map((a) => ({
      id: `app-${a.id}`,
      ts: a.createdAt,
      icon: "shieldCheck", iconCls: "text-slate-400",
      activity: "Verification Request Received",
      details: `${a.qualification} (${a.graduationYear}) — ${a.applicantName}`,
      user: a.applicantName,
      ...(APP_STATUS[a.status] || { label: a.status, tone: "slate" }),
    })),
  ].sort((x, y) => new Date(y.ts || 0) - new Date(x.ts || 0)).slice(0, 8);

  return (
    <PortalShell
      portal="institution"
      active="dashboard"
      title="Institution Portal – Dashboard Overview"
      subtitle={`Welcome back, ${user.name || user.email}. Here's an overview of your institution's BBACVS activity.`}
      user={{ name: user.name || user.email, sub: user.email }}
      actions={
        <>
          <span className="text-[12px] text-slate-500">Data as at: {fmtDateTime(new Date())}</span>
          <ToolButton icon="refresh" aria-label="Refresh" onClick={load} />
        </>
      }
      panel={<AlertsPanel pendingApps={pendingApps} drafts={drafts} />}
      panelWidth="w-[380px]"
    >
      {/* KPI row */}
      <StatRow cols={6}>
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
        <StatCard
          icon="bolt"
          iconTone={profile && profile.heaStatus !== "approved" ? "amber" : "softgreen"}
          label="Accreditation Status"
          value={
            <span className={profile && profile.heaStatus !== "approved" ? "text-amber-600" : "text-emerald-600"}>
              {profile ? (profile.heaStatus || "approved") : "—"}
            </span>
          }
          sub={profile?.zaqaTrusted ? "ZAQA trusted issuer" : profile?.institution || ""}
        />
      </StatRow>

      {/* Charts */}
      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Submission Trends (Last 12 Weeks)" action={<SelectPill label="Last 12 weeks" />}>
          <LineChart series={TREND_SERIES} labels={TREND_LABELS} height={190} />
          <Legend
            className="mt-2 flex items-center gap-5 space-y-0"
            items={[
              { label: "Records Submitted", color: CHART.blue },
              { label: "Records Accepted (dashed)", color: CHART.blue },
            ]}
          />
        </SectionCard>

        <SectionCard
          title="Verification Request Status Distribution"
          action={<Link href="/issuer/classic" className="text-[12px] font-semibold text-blue-600 hover:underline">View all requests →</Link>}
        >
          {apps.length ? (
            <div className="flex flex-wrap items-center justify-center gap-6 py-2">
              <Donut
                segments={requestSegments}
                size={160}
                thickness={22}
                centerTitle={String(apps.length)}
                centerSub="Total"
              />
              <Legend
                className="min-w-[220px]"
                items={requestSegments.map((s) => ({ label: s.label, color: s.color, value: `${s.value} (${s.pct})` }))}
              />
            </div>
          ) : (
            <div className="py-10 text-center text-[13px] text-slate-400">No verification requests yet.</div>
          )}
        </SectionCard>
      </div>

      {/* Recent activity */}
      <SectionCard title="Recent BBACVS Activities" pad="p-0">
        {error && <p className="px-4 pt-3 text-[12px] font-medium text-red-600">{error}</p>}
        {activities.length ? (
          <DataTable
            rowKey="id"
            columns={[
              { key: "date", label: "Date & Time", tdClass: "whitespace-nowrap", render: (r) => fmtDateTime(r.ts) },
              {
                key: "activity",
                label: "Activity",
                render: (r) => (
                  <span className="flex items-center gap-2">
                    <Icon name={r.icon} className={`h-4 w-4 shrink-0 ${r.iconCls}`} />
                    <span className="font-semibold text-slate-800">{r.activity}</span>
                  </span>
                ),
              },
              { key: "details", label: "Details", tdClass: "text-slate-500" },
              { key: "user", label: "User" },
              { key: "status", label: "Status", render: (r) => <Badge tone={r.tone}>{r.label}</Badge> },
              { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
            ]}
            rows={activities}
          />
        ) : (
          <div className="px-4 py-10 text-center text-[13px] text-slate-400">No records yet.</div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <span className="text-[12px] text-slate-500">
            Showing {activities.length ? 1 : 0} to {activities.length} of {creds.length + apps.length} activities
          </span>
          <Link href="/issuer/classic" className="text-[12px] font-semibold text-blue-600 hover:underline">View all activities →</Link>
        </div>
      </SectionCard>

      {/* Footer strip */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
        <span>© 2025 Examinations Council of Zambia (ECZ). All rights reserved.</span>
        <span>·</span>
        <span>BBACVS v2.6.0</span>
        <span>·</span>
        <button className="hover:text-slate-600 hover:underline">Privacy Policy</button>
        <span>·</span>
        <button className="hover:text-slate-600 hover:underline">Help Centre</button>
      </div>
    </PortalShell>
  );
}
