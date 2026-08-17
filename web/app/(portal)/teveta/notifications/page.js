"use client";

import PortalShell from "../../../../components/portal/shell";
import NotificationsPanel from "../../../../components/portal/NotificationsPanel";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function TevetaNotificationsPage() {
  const { ready, token } = usePortalGuard(["teveta"]);
  if (!ready) return null;

  return (
    <PortalShell
      portal="teveta"
      active="notifications"
      title="Notifications"
    >
      <NotificationsPanel token={token} />
    </PortalShell>
  );
}
