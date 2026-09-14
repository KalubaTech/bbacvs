"use client";

import ApplicationsWorkspace from "../../../../components/portal/ApplicationsWorkspace";

export default function EczApplicationsPage() {
  return <ApplicationsWorkspace portal="ecz" roles={["ecz"]} title="ECZ Portal – Learner Applications" />;
}
