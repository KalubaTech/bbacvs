"use client";

import PortalShell from "../../../../components/portal/shell";
import NotificationsPanel from "../../../../components/portal/NotificationsPanel";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function GraduateNotificationsPage() {
  const { ready, token } = usePortalGuard(["holder"]);
  if (!ready) return null;

  return (
    <PortalShell
      portal="graduate"
      active="notifications"
      title="Notifications"
      subtitle="Updates about your credentials, applications, and verification activity."
    >
      <NotificationsPanel token={token} />
    </PortalShell>
  );
}
