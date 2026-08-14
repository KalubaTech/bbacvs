"use client";

import PortalShell from "../../../../components/portal/shell";
import QualificationsWorkflow from "../../../../components/portal/QualificationsWorkflow";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function InstitutionQualificationsPage() {
  const { ready, user, token } = usePortalGuard(["issuer"]);
  if (!ready) return null;

  return (
    <PortalShell
      portal="institution"
      active="qualifications"
      title="Qualification Proposals"
      subtitle="Propose qualification designs for national registration and track them through authority review to the ZAQA register."
    >
      <QualificationsWorkflow token={token} role={user.role} mode="issuer" />
    </PortalShell>
  );
}
