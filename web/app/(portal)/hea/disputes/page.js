"use client";

import PortalShell from "../../../../components/portal/shell";
import DisputesWorkspace from "../../../../components/portal/DisputesWorkspace";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function HeaDisputesPage() {
  const { ready, user, token } = usePortalGuard(["hea"]);
  if (!ready) return null;
  return (
    <PortalShell portal="hea" active="disputes" title="Disputes">
      <DisputesWorkspace token={token} role={user.role} mode="authority" />
    </PortalShell>
  );
}
