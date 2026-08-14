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
      subtitle="Regulatory updates and alerts for your TEVETA seat."
    >
      <NotificationsPanel token={token} />
    </PortalShell>
  );
}
