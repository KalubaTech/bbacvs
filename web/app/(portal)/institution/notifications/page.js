"use client";

import PortalShell from "../../../../components/portal/shell";
import NotificationsPanel from "../../../../components/portal/NotificationsPanel";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function InstitutionNotificationsPage() {
  const { ready, token } = usePortalGuard(["issuer"]);
  if (!ready) return null;

  return (
    <PortalShell
      portal="institution"
      active="notifications"
      title="Notifications"
    >
      <NotificationsPanel token={token} />
    </PortalShell>
  );
}
