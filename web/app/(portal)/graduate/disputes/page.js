"use client";

import PortalShell from "../../../../components/portal/shell";
import DisputesWorkspace from "../../../../components/portal/DisputesWorkspace";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function GraduateDisputesPage() {
  const { ready, user, token } = usePortalGuard(["holder"]);
  if (!ready) return null;

  return (
    <PortalShell
      portal="graduate"
      active="disputes"
      title="Corrections & Disputes"
      subtitle="Raise a dispute about a credential, follow the case timeline, and appeal a decision if needed."
    >
      <DisputesWorkspace token={token} role={user.role} mode="holder" />
    </PortalShell>
  );
}
