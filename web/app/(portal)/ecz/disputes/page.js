"use client";

import PortalShell from "../../../../components/portal/shell";
import DisputesWorkspace from "../../../../components/portal/DisputesWorkspace";
import { usePortalGuard } from "../../../../components/portal/auth";

// The single ECZ home of the disputes workspace. /ecz/requests keeps its own
// lighter verification-requests view over the same server-scoped queue.
export default function EczDisputesPage() {
  const { ready, user, token } = usePortalGuard(["ecz"]);
  if (!ready) return null;

  return (
    <PortalShell
      portal="ecz"
      active="disputes"
      title="Disputes & Corrections"
      subtitle="Credential disputes routed to ECZ as lead authority — review, decide and track appeals."
    >
      <DisputesWorkspace token={token} role={user.role} mode="authority" />
    </PortalShell>
  );
}
