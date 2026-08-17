"use client";

import PortalShell from "../../../../components/portal/shell";
import DisputesWorkspace from "../../../../components/portal/DisputesWorkspace";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function ZaqaDisputesPage() {
  const { ready, user, token } = usePortalGuard(["zaqa"]);
  if (!ready) return null;
  return (
    <PortalShell
      portal="zaqa"
      active="disputes"
      title="Disputes & Appeals"
    >
      <DisputesWorkspace token={token} role={user.role} mode="authority" />
    </PortalShell>
  );
}
