"use client";

import PortalShell from "../../../../components/portal/shell";
import NotificationsPanel from "../../../../components/portal/NotificationsPanel";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function HeaNotificationsPage() {
  const { ready, token } = usePortalGuard(["hea"]);
  if (!ready) return null;
  return (
    <PortalShell portal="hea" active="notifications" title="Notifications">
      <NotificationsPanel token={token} />
    </PortalShell>
  );
}
