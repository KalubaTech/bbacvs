"use client";

import PortalShell from "../../../../components/portal/shell";
import RecognitionWorkspace from "../../../../components/portal/RecognitionWorkspace";
import { usePortalGuard } from "../../../../components/portal/auth";

// TEVETA is the lead authority for RPL cases — the server scopes the queue to it.
export default function TevetaRplPage() {
  const { ready, user, token } = usePortalGuard(["teveta"]);
  if (!ready) return null;

  return (
    <PortalShell
      portal="teveta"
      active="rpl"
      title="RPL Applications"
    >
      <RecognitionWorkspace token={token} role={user.role} mode="authority" />
    </PortalShell>
  );
}
