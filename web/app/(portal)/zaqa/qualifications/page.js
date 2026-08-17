"use client";

import PortalShell from "../../../../components/portal/shell";
import QualificationsWorkflow from "../../../../components/portal/QualificationsWorkflow";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function ZaqaQualificationsPage() {
  const { ready, user, token } = usePortalGuard(["zaqa"]);
  if (!ready) return null;
  return (
    <PortalShell
      portal="zaqa"
      active="qualifications"
      title="Qualification Registration"
    >
      <QualificationsWorkflow token={token} role={user.role} mode="zaqa" />
    </PortalShell>
  );
}
