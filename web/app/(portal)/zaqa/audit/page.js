"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, StatCard, StatRow, SectionCard, SearchBox, ToolButton, SelectPill,
  DataTable, Pagination,
} from "../../../../components/portal/kit";
import { CHART, Legend, LineChart, Bars } from "../../../../components/portal/charts";
import { usePortalGuard, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const ROLE_TONE = {
  admin: "blue", zaqa: "teal", hea: "indigo", teveta: "cyan", ecz: "orange",
  issuer: "purple", holder: "slate",
};

// Static report catalogue + sample analytics (no backend counterpart).
const REPORTS = [
  { name: "Validation Summary Report", tag: "PDF" },
  { name: "Dispute Analysis Report", tag: "PDF" },
  { name: "SLA Compliance Report", tag: "PDF" },
  { name: "Suspension & Revocation Report", tag: "PDF" },
  { name: "Audit Log Report", tag: "CSV" },
];

const MONTHS = ["Dec '24", "Jan '25", "Feb '25", "Mar '25", "Apr '25", "May '25"];

const VALIDATION_OUTCOMES = [
  [620, 260, 120], [700, 300, 140], [760, 280, 110], [900, 380, 160], [820, 340, 150], [880, 320, 130],
].map((values, i) => ({ label: MONTHS[i], values }));

const SUSP_REVOC = [
  [42, 22], [50, 26], [46, 20], [55, 30], [48, 24], [52, 28],
].map((values, i) => ({ label: MONTHS[i], values }));

function CardLink({ children }) {
  return <button className="text-[12px] font-semibold text-blue-600 hover:underline">{children}</button>;
}

function ReportsPanel() {
  return (
    <div>
      <div id="reports" />
      <SectionCard
        title="Reports"
        action={<CardLink>View all reports</CardLink>}
        className="mb-4"
      >
        <p className="-mt-1 mb-3 text-[12px] text-slate-500">Generate and download reports</p>
        <div className="space-y-1">
          {REPORTS.map((r) => (
            <div key={r.name} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-slate-50">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Icon name="file" className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-slate-700">{r.name}</span>
              <Badge tone="outline">{r.tag}</Badge>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Monthly Validation Outcomes" action={<CardLink>View analytics</CardLink>} className="mb-4">
        <Bars groups={VALIDATION_OUTCOMES} colors={[CHART.green, CHART.amber, CHART.red]} height={160} />
        <Legend
          className="mt-3"
          items={[
            { label: "Successful", color: CHART.green },
            { label: "Pending", color: CHART.amber },
            { label: "Rejected", color: CHART.red },
          ]}
        />
      </SectionCard>

      <SectionCard title="Dispute Trends (Last 6 Months)" action={<CardLink>View analytics</CardLink>} className="mb-4">
        <LineChart
          height={160}
          labels={MONTHS}
          series={[
            { points: [95, 105, 88, 110, 92, 100], color: CHART.blue, label: "Opened" },
            { points: [60, 75, 80, 95, 85, 98], color: CHART.green, label: "Resolved" },
            { points: [35, 42, 30, 45, 38, 44], color: CHART.orange, label: "Escalated" },
          ]}
        />
        <Legend
          className="mt-3"
          items={[
            { label: "Opened", color: CHART.blue },
            { label: "Resolved", color: CHART.green },
            { label: "Escalated", color: CHART.orange },
          ]}
        />
      </SectionCard>

      <SectionCard title="Suspensions & Revocations" action={<CardLink>View analytics</CardLink>}>
        <Bars groups={SUSP_REVOC} colors={[CHART.purple, CHART.red]} height={160} />
        <Legend
          className="mt-3"
          items={[
            { label: "Suspensions", color: CHART.purple },
            { label: "Revocations", color: CHART.red },
          ]}
        />
      </SectionCard>
    </div>
  );
}

export default function ZaqaAuditPage() {
  const { ready, user, token } = usePortalGuard(["zaqa"]);
  const [activity, setActivity] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const a = await api.activity(token).catch(async () => {
        // Fallback: on-chain audit events reshaped onto the same columns.
        const b = await api.audit(token);
        return {
          activity: (b.events || []).map((e) => ({
            actor: e.issuer || e.args?.issuer || "—", role: "issuer",
            action: e.event || "CredentialIssued", summary: "On-chain issuance event", at: null,
          })),
        };
      });
      setActivity(a.activity || []);
    } catch (err) { setError(err.message); }
    try {
      const n = await api.myNotifications(token);
      setNotifications(n.notifications || []);
      setUnread(n.unread || 0);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  if (!ready) return null;

  const rows = activity.filter(
    (l) => !q || `${l.actor} ${l.role} ${l.action} ${l.summary}`.toLowerCase().includes(q.toLowerCase())
  );

  const today = new Date().toDateString();
  const todayCount = activity.filter((a) => a.at && new Date(a.at).toDateString() === today).length;
  const zaqaActions = activity.filter((a) => (a.action || "").startsWith("zaqa.")).length;
  const disputeActions = activity.filter((a) => (a.action || "").startsWith("dispute.")).length;

  return (
    <PortalShell
      portal="zaqa"
      active="audit"
      title="ZAQA Portal – Audit & Compliance"
      subtitle="Monitor system activity, generate reports and manage notifications, escalations and compliance."
      user={{ name: user.name || user.email, sub: user.email }}
      bellCount={unread}
      panel={<ReportsPanel />}
      panelWidth="w-[380px]"
    >
      <StatRow cols={4}>
        <StatCard icon="clipboard" iconTone="softblue" label="Audit Events" value={activity.length} sub="Accountability trail" />
        <StatCard icon="user" iconTone="softgreen" label="Actions Today" value={todayCount} sub="Recorded today" />
        <StatCard icon="alert" iconTone="softred" label="ZAQA Decisions" value={zaqaActions} sub="Validation & revocation actions" />
        <StatCard icon="bell" iconTone="purple" label="Unread Notifications" value={unread} sub="In your inbox" />
      </StatRow>

      {error && <div className="mb-3 text-[12.5px] font-medium text-red-600">{error}</div>}

      <SectionCard title="Audit Log" className="mb-4" pad="px-4 pb-1 pt-4">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-72" placeholder="Search audit logs..." value={q} onChange={setQ} />
          <ToolButton icon="filter">Filter</ToolButton>
          <SelectPill label="Export" />
          <ToolButton icon="refresh" onClick={load} />
        </div>
        <DataTable
          columns={[
            { key: "at", label: "Timestamp", render: (r) => fmtDateTime(r.at) },
            { key: "actor", label: "User" },
            { key: "role", label: "Role", render: (r) => <Badge tone={ROLE_TONE[r.role] || "slate"}>{(r.role || "—").toUpperCase()}</Badge> },
            { key: "action", label: "Action" },
            { key: "summary", label: "Details" },
          ]}
          rows={rows}
        />
        {rows.length === 0 && (
          <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
        )}
        <Pagination summary={`Showing ${rows.length} of ${activity.length} events`} page={1} pages={1} />
      </SectionCard>

      <SectionCard title="Notifications & Escalations">
        <p className="-mt-1 mb-4 text-[12px] text-slate-500">Your latest in-app notifications.</p>
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard icon="bell" iconTone="softred" label="Unread" value={unread} sub="Awaiting your attention" />
          <StatCard icon="check" iconTone="softgreen" label="Read" value={notifications.length - notifications.filter((n) => !n.read).length} sub="Already reviewed" />
          <StatCard icon="clock" iconTone="amber" label="Received Today" value={notifications.filter((n) => n.at && new Date(n.at).toDateString() === today).length} sub="In the last 24 hours" />
          <StatCard icon="users" iconTone="purple" label="Dispute Actions" value={disputeActions} sub="From the activity trail" />
        </div>
        <div className="mb-2 text-[13px] font-semibold text-slate-800">Recent Notifications</div>
        <DataTable
          columns={[
            { key: "type", label: "Type", render: (r) => <Badge tone={r.read ? "slate" : "amber"}>{r.read ? "Read" : "New"}</Badge> },
            { key: "message", label: "Message" },
            { key: "at", label: "Occurred", render: (r) => fmtDateTime(r.at) },
            { key: "status", label: "Status", render: (r) => <Badge tone={r.read ? "slate" : "blue"}>{r.read ? "Closed" : "Open"}</Badge> },
          ]}
          rows={notifications}
          rowKey="id"
        />
        {notifications.length === 0 && (
          <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
        )}
        <div className="py-3">
          <CardLink>View all notifications →</CardLink>
        </div>
      </SectionCard>
    </PortalShell>
  );
}
