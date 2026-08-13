"use client";

import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import OrganisationAlertsPanel from "@/components/organisation/OrganisationAlertsPanel";

export default function OrganisationAlertsPage() {
  return (
    <AdminConsoleShell requireOrganisationAccess>
      <OrganisationAlertsPanel />
    </AdminConsoleShell>
  );
}
