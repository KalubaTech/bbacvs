"use client";

import PortalShell from "../../../../components/portal/shell";
import NotificationsPanel from "../../../../components/portal/NotificationsPanel";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function AdminNotificationsPage() {
  const { ready, token } = usePortalGuard(["admin"]);
  if (!ready) return null;
  return (
    <PortalShell portal="admin" active="notifications" title="Notifications">
      <NotificationsPanel token={token} />
    </PortalShell>
  );
}
