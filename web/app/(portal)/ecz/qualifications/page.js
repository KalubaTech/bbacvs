"use client";

import PortalShell from "../../../../components/portal/shell";
import QualificationsWorkflow from "../../../../components/portal/QualificationsWorkflow";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function EczQualificationsPage() {
  const { ready, user, token } = usePortalGuard(["ecz"]);
  if (!ready) return null;

  return (
    <PortalShell
      portal="ecz"
      active="qualifications"
      title="Qualification Registration Applications"
      subtitle="Review qualification proposals in ECZ's inbox and recommend them for national registration."
    >
      <QualificationsWorkflow token={token} role={user.role} mode="authority" />
    </PortalShell>
  );
}
