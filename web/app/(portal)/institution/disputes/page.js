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
    >
      <DisputesWorkspace token={token} role={user.role} mode="authority" />
    </PortalShell>
  );
}
