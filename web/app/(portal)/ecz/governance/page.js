"use client";

import PortalShell from "../../../../components/portal/shell";
import GovernanceCosign from "../../../../components/portal/GovernanceCosign";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function EczGovernancePage() {
  const { ready, token } = usePortalGuard(["ecz"]);
  if (!ready) return null;
  return (
    <PortalShell portal="ecz" active="governance" title="Governance co-signing">
      <GovernanceCosign token={token} canSign={true} />
    </PortalShell>
  );
}
