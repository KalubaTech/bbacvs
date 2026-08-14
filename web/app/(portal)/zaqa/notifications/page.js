"use client";

import PortalShell from "../../../../components/portal/shell";
import NotificationsPanel from "../../../../components/portal/NotificationsPanel";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function ZaqaNotificationsPage() {
  const { ready, token } = usePortalGuard(["zaqa"]);
  if (!ready) return null;
  return (
    <PortalShell
      portal="zaqa"
      active="notifications"
      title="Notifications"
      subtitle="In-app notifications about decisions, submissions and cases that involve your authority."
    >
      <NotificationsPanel token={token} />
    </PortalShell>
  );
}
