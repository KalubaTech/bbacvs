"use client";

import PortalShell from "../../../../components/portal/shell";
import GovernanceCosign from "../../../../components/portal/GovernanceCosign";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function HeaGovernancePage() {
  const { ready, token } = usePortalGuard(["hea"]);
  if (!ready) return null;
  return (
    <PortalShell portal="hea" active="governance" title="Governance co-signing">
      <GovernanceCosign token={token} canSign={true} />
    </PortalShell>
  );
}
