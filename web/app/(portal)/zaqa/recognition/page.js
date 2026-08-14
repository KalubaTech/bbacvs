"use client";

import PortalShell from "../../../../components/portal/shell";
import RecognitionWorkspace from "../../../../components/portal/RecognitionWorkspace";
import { usePortalGuard } from "../../../../components/portal/auth";

export default function ZaqaRecognitionPage() {
  const { ready, user, token } = usePortalGuard(["zaqa"]);
  if (!ready) return null;
  return (
    <PortalShell
      portal="zaqa"
      active="recognition"
      title="RPL & Credit Transfer"
      subtitle="Recognition of prior learning, credit transfer, progression, foreign qualification and micro-credential cases."
    >
      <RecognitionWorkspace token={token} role={user.role} mode="authority" />
    </PortalShell>
  );
}
