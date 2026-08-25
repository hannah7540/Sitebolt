"use client";

import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import IncidentsPage from "@/components/administration/forms/IncidentsPage";

export default function AdminIncidentsFormsRoute() {
  return (
    <AdminConsoleShell>
      <IncidentsPage />
    </AdminConsoleShell>
  );
}
