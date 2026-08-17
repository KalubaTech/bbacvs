"use client";

import PortalShell from "../../../../components/portal/shell";
import QualificationsWorkflow from "../../../../components/portal/QualificationsWorkflow";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function HeaQualificationsPage() {
  const { ready, user, token } = usePortalGuard(["hea"]);
  if (!ready) return null;
  return (
    <PortalShell
      portal="hea"
      active="qualifications"
      title="Qualification Registration Applications"
    >
      <QualificationsWorkflow token={token} role={user.role} mode="authority" />
    </PortalShell>
  );
}
