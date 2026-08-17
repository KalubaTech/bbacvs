"use client";

import PortalShell from "../../../../components/portal/shell";
import NotificationsPanel from "../../../../components/portal/NotificationsPanel";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function EczNotificationsPage() {
  const { ready, token } = usePortalGuard(["ecz"]);
  if (!ready) return null;

  return (
    <PortalShell
      portal="ecz"
      active="notifications"
      title="Notifications"
    >
      <NotificationsPanel token={token} />
    </PortalShell>
  );
}
