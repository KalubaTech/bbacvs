"use client";

import PortalShell from "../../../../components/portal/shell";
import GovernanceCosign from "../../../../components/portal/GovernanceCosign";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function ZaqaGovernancePage() {
  const { ready, token } = usePortalGuard(["zaqa"]);
  if (!ready) return null;
  return (
    <PortalShell portal="zaqa" active="governance" title="Governance co-signing">
      <GovernanceCosign token={token} canSign={false} />
    </PortalShell>
  );
}
