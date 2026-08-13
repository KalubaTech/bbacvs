"use client";

// Shared notifications list used by every portal's Notifications page.
// Live data from /api/notifications with mark-all-read.

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Badge, ErrorBanner, SectionCard, ToolButton } from "./kit";
import { fmtDateTime } from "./auth";
import Icon from "./icons";

export default function NotificationsPanel({ token }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const d = await api.myNotifications(token);
      setItems(d.notifications || d.items || (Array.isArray(d) ? d : []));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead() {
    setBusy(true);
    try {
      await api.markNotificationsRead(token);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <SectionCard
      title={`Notifications${unread ? ` · ${unread} unread` : ""}`}
      action={
        <ToolButton icon="check" onClick={markRead} disabled={busy || unread === 0} className={busy || unread === 0 ? "opacity-50" : ""}>
          Mark all read
        </ToolButton>
      }
      pad="p-0"
    >
      <ErrorBanner error={error} onRetry={load} className="m-4 mb-0" />
      {loading && (
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}
      {!loading && items.length === 0 && (
        <div className="py-12 text-center text-[13px] text-slate-400">Nothing yet — regulatory updates will appear here.</div>
      )}
      {!loading &&
        items.map((n) => (
          <div
            key={n._id || n.id}
            className={`flex items-start gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 ${n.read ? "" : "bg-blue-50/40"}`}
          >
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.read ? "bg-slate-100 text-slate-400" : "bg-blue-100 text-blue-600"}`}>
              <Icon name="bell" className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-[13px] ${n.read ? "text-slate-600" : "font-medium text-slate-800"}`}>{n.message}</div>
              <div className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</div>
            </div>
            {!n.read && <Badge tone="blue">New</Badge>}
          </div>
        ))}
    </SectionCard>
  );
}
