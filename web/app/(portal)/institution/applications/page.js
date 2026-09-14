"use client";

import ApplicationsWorkspace from "../../../../components/portal/ApplicationsWorkspace";

export default function InstitutionApplicationsPage() {
  return <ApplicationsWorkspace portal="institution" roles={["issuer"]} title="Graduate Applications" />;
}
