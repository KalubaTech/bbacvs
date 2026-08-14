"use client";

import PortalShell from "../../../../components/portal/shell";
import DisputesWorkspace from "../../../../components/portal/DisputesWorkspace";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function TevetaDisputesPage() {
  const { ready, user, token } = usePortalGuard(["teveta"]);
  if (!ready) return null;

  return (
    <PortalShell
      portal="teveta"
      active="disputes"
      title="Disputes"
      subtitle="Credential disputes routed to TEVETA as lead authority — review, decide and track appeals."
    >
      <DisputesWorkspace token={token} role={user.role} mode="authority" />
    </PortalShell>
  );
}
