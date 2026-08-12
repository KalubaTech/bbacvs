"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, StatCard, StatRow, SectionCard, SearchBox, SelectPill,
  ToolButton, DataTable, Pagination, KVGrid, ActionBtn, TONES,
} from "../../../../components/portal/kit";
import { api } from "../../../../lib/api";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";

// Static decorative content — escalation paths / SLA policies have no backend counterpart.
const ESCALATION = [
  { role: "Registry Officer", status: "Completed", tone: "green" },
  { role: "Qualification Evaluator", status: "Completed", tone: "green" },
  { role: "Dispute Officer", status: "Current", tone: "blue" },
  { role: "Senior Dispute Officer", status: "Pending", tone: "slate" },
  { role: "Director – Operations", status: "Pending", tone: "slate" },
];

function DetailPanel({ notif }) {
  if (!notif) {
    return (
      <div>
        <h2 className="mb-4 text-[15px] font-bold text-slate-900">Notification Details</h2>
        <p className="text-[13px] text-slate-400">No notification selected.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONES.softblue}`}>
            <Icon name="inbox" className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold leading-snug text-slate-900">{notif.message}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={notif.read ? "outline" : "blue"}>{notif.read ? "Read" : "Unread"}</Badge>
            </div>
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-slate-400">{fmtDate(notif.at)}</span>
      </div>

      <SectionCard title="Full Message" className="mb-4" pad="p-4">
        <p className="text-[12.5px] leading-snug text-slate-600">{notif.message}</p>
        <KVGrid
          cols={2}
          className="mt-4"
          items={[
            { label: "Received", value: fmtDateTime(notif.at) },
            { label: "Status", value: notif.read ? "Read" : "Unread" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Escalation Path" className="mb-4" pad="p-4">
        <div className="space-y-2.5">
          {ESCALATION.map((s) => (
            <div key={s.role} className="flex items-center justify-between gap-3">
              <div className="min-w-0 leading-tight">
                <div className="text-[12.5px] font-semibold text-slate-800">{s.role}</div>
              </div>
              <Badge tone={s.tone}>{s.status}</Badge>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Quick Actions" className="mb-4" pad="p-4">
        <div className="grid grid-cols-2 gap-2.5">
          <ActionBtn tone="blue" icon="users" full>Assign Officer</ActionBtn>
          <ActionBtn tone="green" full>Resolve</ActionBtn>
          <ActionBtn tone="orange" full>Escalate Further</ActionBtn>
          <ActionBtn tone="outline" icon="send" full>Send Reminder</ActionBtn>
        </div>
      </SectionCard>

      <div>
        <div className="mb-1.5 text-[12px] font-semibold text-slate-800">Add Internal Note</div>
        <div className="flex items-center gap-2">
          <input
            className="w-full flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Add a note..."
            readOnly
          />
          <ActionBtn tone="blue" className="shrink-0">Save Note</ActionBtn>
        </div>
      </div>
    </div>
  );
}

export default function ZaqaNotificationsPage() {
  const { ready, user, token } = usePortalGuard(["zaqa"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.myNotifications(token);
      setNotifs(res.notifications || []);
      setUnread(res.unread || 0);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function markAllRead() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.markNotificationsRead(token);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  const rows = notifs.filter((n) => !q || (n.message || "").toLowerCase().includes(q.toLowerCase()));
  const selected = rows.find((n) => n.id === sel) || rows[0] || null;
  const readCount = notifs.length - unread;
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const thisWeek = notifs.filter((n) => n.at && new Date(n.at).getTime() >= weekAgo).length;

  return (
    <PortalShell
      portal="zaqa"
      active="notifications"
      title="ZAQA Portal – Notifications & Escalations"
      subtitle="Stay informed and take action on important notifications, escalations, and SLA alerts."
      user={{ name: user.name || user.email, sub: user.email }}
      bellCount={unread}
      panel={<DetailPanel notif={selected} />}
      panelWidth="w-[400px]"
    >
      <StatRow cols={4}>
        <StatCard icon="bell" iconTone="softblue" label="Unread Notifications" value={unread} sub="Awaiting your attention" />
        <StatCard icon="inbox" iconTone="purple" label="Total Notifications" value={notifs.length} sub="Latest 30 shown" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Read" value={readCount} sub="Already actioned" />
        <StatCard icon="calendar" iconTone="amber" label="Received This Week" value={thisWeek} sub="Last 7 days" />
      </StatRow>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-72" placeholder="Search notifications..." value={q} onChange={setQ} />
          <SelectPill label="All Types" />
          <SelectPill label="All Statuses" />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton
            icon="checkCircle"
            onClick={markAllRead}
            disabled={busy || unread === 0}
            className="disabled:opacity-50"
          >
            {busy ? "Marking…" : "Mark all read"}
          </ToolButton>
        </div>
        {error && <div className="px-4 pb-2 text-[12.5px] font-medium text-red-600">{error}</div>}
        <DataTable
          rowKey="id"
          activeKey={selected?.id}
          onRowClick={(r) => setSel(r.id)}
          columns={[
            {
              key: "icon",
              label: "Type",
              thClass: "w-14",
              render: (r) => (
                <span className={`flex h-8 w-8 items-center justify-center rounded-full ${r.read ? TONES.slate : TONES.softblue}`}>
                  <Icon name="bell" className="h-4 w-4" />
                </span>
              ),
            },
            {
              key: "message",
              label: "Message",
              render: (r) => (
                <span className={`${r.read ? "font-medium text-slate-600" : "font-semibold text-slate-800"}`}>
                  {r.message}
                </span>
              ),
            },
            { key: "at", label: "Received", render: (r) => fmtDateTime(r.at) },
            {
              key: "status",
              label: "Status",
              render: (r) => <Badge tone={r.read ? "outline" : "blue"}>{r.read ? "Read" : "Unread"}</Badge>,
            },
            { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
          ]}
          rows={rows}
          footer={
            rows.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
            ) : null
          }
        />
        <Pagination summary={`Showing ${rows.length} of ${notifs.length} notifications`} page={1} pages={1} />
      </div>
    </PortalShell>
  );
}
