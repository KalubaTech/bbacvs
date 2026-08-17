"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/portal/shell";
import Icon from "../../../components/portal/icons";
import {
  Badge, StatCard, StatRow, SectionCard, ToolButton, DataTable, KVRow, ErrorBanner, TONES,
} from "../../../components/portal/kit";
import { usePortalGuard, fmtDateTime } from "../../../components/portal/auth";
import { api } from "../../../lib/api";

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
  submitted: { label: "Submitted", tone: "blue" },
  screening: { label: "Screening", tone: "amber" },
  under_review: { label: "Records Review", tone: "orange" },
  awaiting_evidence: { label: "Awaiting Evidence", tone: "amber" },
  decision_pending: { label: "Decision Pending", tone: "purple" },
  issued: { label: "Issued", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  withdrawn: { label: "Withdrawn", tone: "slate" },
};

// Statuses that still need institution action.
const OPEN_APP_STATUSES = ["submitted", "screening", "under_review", "awaiting_evidence", "decision_pending"];

const QUICK_ACTIONS = [
  { icon: "apps", label: "Graduate Applications", href: "/institution/applications" },
  { icon: "clipboard", label: "Qualification Proposals", href: "/institution/qualifications" },
  { icon: "award", label: "Issue Credential", href: "/issuer/classic" },
  { icon: "registry", label: "Programmes", href: "/institution/programmes" },
];

function AlertsPanel({ openApps, drafts, corrections }) {
  const alerts = [
    {
      icon: "clock", iconTone: "amber", title: "Open Application Cases",
      level: openApps > 0 ? "High" : "Info", levelTone: openApps > 0 ? "red" : "slate",
      body: `${openApps} graduate application${openApps === 1 ? "" : "s"} awaiting your action.`,
      link: "Review applications →", href: "/institution/applications",
    },
    {
      icon: "fileText", iconTone: "softblue", title: "Draft Credentials Not Submitted",
      level: drafts > 0 ? "Medium" : "Info", levelTone: drafts > 0 ? "amber" : "slate",
      body: `${drafts} issued credential${drafts === 1 ? "" : "s"} ${drafts === 1 ? "has" : "have"} not been submitted to ZAQA for validation.`,
      link: "Submit to ZAQA →", href: "/institution/evidence",
    },
    {
      icon: "edit", iconTone: "softred", title: "Open Correction Requests",
      level: corrections > 0 ? "High" : "Info", levelTone: corrections > 0 ? "red" : "slate",
      body: `${corrections} graduate correction request${corrections === 1 ? "" : "s"} awaiting a corrected credential.`,
      link: "Resolve corrections →", href: "/institution/evidence",
    },
  ];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-[14px] font-bold text-slate-900">Institution Alerts & Actions</h2>
          <Badge tone={openApps + drafts + corrections > 0 ? "red" : "slate"}>
            {openApps + drafts + corrections}
          </Badge>
        </div>
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
                <Link href={a.href} className="mt-1.5 inline-block text-[11.5px] font-semibold text-blue-600 hover:underline">
                  {a.link}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-2 text-[13px] font-bold text-slate-900">Quick Actions</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setError(null);
      const [c, a, p] = await Promise.all([
        api.myIssued(token),
        api.incomingApplications(token),
        api.issuerProfile(token).catch(() => null),
      ]);
      setCreds(c.credentials || []);
      setApps(a.applications || []);
      setProfile(p);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  if (!ready) return null;

  const zaqaCounts = creds.reduce((m, c) => {
    const s = c.zaqaValidation || "draft";
    m[s] = (m[s] || 0) + 1;
    return m;
  }, {});
  const appCounts = apps.reduce((m, a) => ((m[a.status] = (m[a.status] || 0) + 1), m), {});
  const openApps = OPEN_APP_STATUSES.reduce((n, s) => n + (appCounts[s] || 0), 0);
  const drafts = zaqaCounts.draft || 0;
  const corrections = creds.filter((c) => c.correctionRequest?.status === "open").length;
  const flagged =
    corrections +
    creds.filter((c) => ["suspicious", "under_dispute", "rejected", "suspended"].includes(c.zaqaValidation)).length;

  const kpis = [
    { icon: "award", iconTone: "purple", label: "Credentials Issued", value: String(creds.length), sub: "All time" },
    { icon: "fileText", iconTone: "softblue", label: "Draft Credentials", value: String(drafts), sub: "Not yet sent to ZAQA" },
    { icon: "clock", iconTone: "amber", label: "Pending ZAQA Review", value: String(zaqaCounts.pending || 0), sub: "Awaiting national validation" },
    { icon: "checkCircle", iconTone: "softgreen", label: "ZAQA Validated", value: String(zaqaCounts.validated || 0), sub: "Nationally validated" },
    { icon: "alert", iconTone: "softred", label: "Needs Attention", value: String(flagged), sub: "Corrections & ZAQA flags" },
    { icon: "apps", iconTone: "softblue", label: "Open Application Cases", value: String(openApps), sub: "Graduate digitisation requests" },
  ];

  // Recent activity: credentials issued + applications received, newest first.
  const activities = [
    ...creds.map((c) => ({
      id: `cred-${c.credentialHash}`,
      ts: c.issuedAt,
      icon: "award",
      activity: "Credential Issued",
      details: `${c.qualification} — ${c.subjectName}`,
      ...(CRED_STATUS[c.zaqaValidation] || { label: c.zaqaValidation || c.status, tone: "slate" }),
    })),
    ...apps.map((a) => ({
      id: `app-${a.id}`,
      ts: a.createdAt,
      icon: "apps",
      activity: "Application Received",
      details: `${a.qualification} (${a.graduationYear}) — ${a.applicantName}`,
      ...(APP_STATUS[a.status] || { label: a.status, tone: "slate" }),
    })),
  ].sort((x, y) => new Date(y.ts || 0) - new Date(x.ts || 0)).slice(0, 8);

  return (
    <PortalShell
      portal="institution"
      active="dashboard"
      title="Institution Portal – Dashboard Overview"
      actions={<ToolButton icon="refresh" aria-label="Refresh" onClick={load} />}
      panel={<AlertsPanel openApps={openApps} drafts={drafts} corrections={corrections} />}
      panelWidth="w-[380px]"
    >
      <ErrorBanner error={error} onRetry={load} />

      {/* KPI row */}
      <StatRow cols={6}>
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </StatRow>

      {/* Accreditation strip */}
      {profile && (
        <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
            <Icon name="bank" className="h-4 w-4 text-slate-400" />
            {profile.institution}
          </span>
          <Badge tone={(profile.heaStatus || "approved") === "approved" ? "green" : "amber"}>
            Accreditation: {profile.heaStatus || "approved"}
          </Badge>
          {profile.zaqaTrusted && <Badge tone="softgreen" icon="shieldCheck">ZAQA trusted issuer</Badge>}
          <Badge tone="outline">{(profile.accreditedPrograms || []).length} accredited programme{(profile.accreditedPrograms || []).length === 1 ? "" : "s"}</Badge>
        </div>
      )}

      {/* Status breakdowns */}
      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard
          title="Credential Trust Pipeline"
          action={
            <Link href="/institution/evidence" className="text-[12px] font-semibold text-blue-600 hover:underline">
              View all →
            </Link>
          }
        >
          {creds.length === 0 && !loading ? (
            <div className="py-6 text-center text-[13px] text-slate-400">No credentials issued yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {["draft", "pending", "validated", "rejected", "suspicious", "under_dispute", "suspended"]
                .filter((s) => zaqaCounts[s])
                .map((s) => (
                  <KVRow
                    key={s}
                    label={<Badge tone={CRED_STATUS[s].tone}>{CRED_STATUS[s].label}</Badge>}
                    value={zaqaCounts[s]}
                  />
                ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Graduate Application Casework"
          action={
            <Link href="/institution/applications" className="text-[12px] font-semibold text-blue-600 hover:underline">
              View all →
            </Link>
          }
        >
          {apps.length === 0 && !loading ? (
            <div className="py-6 text-center text-[13px] text-slate-400">No applications received yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {Object.keys(APP_STATUS)
                .filter((s) => appCounts[s])
                .map((s) => (
                  <KVRow
                    key={s}
                    label={<Badge tone={APP_STATUS[s].tone}>{APP_STATUS[s].label}</Badge>}
                    value={appCounts[s]}
                  />
                ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Recent activity */}
      <SectionCard
        title="Recent BBACVS Activities"
        pad="p-0"
        action={
          <Link href="/institution/applications" className="text-[12px] font-semibold text-blue-600 hover:underline">
            View all applications →
          </Link>
        }
      >
        <DataTable
          rowKey="id"
          loading={loading}
          emptyText="No records yet."
          columns={[
            { key: "date", label: "Date & Time", tdClass: "whitespace-nowrap", render: (r) => fmtDateTime(r.ts) },
            {
              key: "activity",
              label: "Activity",
              render: (r) => (
                <span className="flex items-center gap-2">
                  <Icon name={r.icon} className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="font-semibold text-slate-800">{r.activity}</span>
                </span>
              ),
            },
            { key: "details", label: "Details", tdClass: "text-slate-500" },
            { key: "status", label: "Status", render: (r) => <Badge tone={r.tone}>{r.label}</Badge> },
          ]}
          rows={activities}
        />
      </SectionCard>

      {/* Footer strip */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
        <span>BBACVS Institution Portal — Blockchain-Based Academic Credential Verification System</span>
        <span>·</span>
        <span>BBACVS v2.6.0</span>
      </div>
    </PortalShell>
  );
}
