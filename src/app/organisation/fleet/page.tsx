"use client";

import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import FleetAdminPanel from "@/components/fleet/FleetAdminPanel";

export default function OrganisationFleetPage() {
  return (
    <AdminConsoleShell requireOrganisationAccess>
      <FleetAdminPanel />
    </AdminConsoleShell>
  );
}
