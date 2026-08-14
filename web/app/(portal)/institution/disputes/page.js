"use client";

import PortalShell from "../../../../components/portal/shell";
import DisputesWorkspace from "../../../../components/portal/DisputesWorkspace";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function InstitutionDisputesPage() {
  const { ready, user, token } = usePortalGuard(["issuer"]);
  if (!ready) return null;

  return (
    <PortalShell
      portal="institution"
      active="disputes"
      title="Disputes & Corrections"
      subtitle="Dispute cases routed to your institution — review, request evidence, and record decisions."
    >
      <DisputesWorkspace token={token} role={user.role} mode="authority" />
    </PortalShell>
  );
}
