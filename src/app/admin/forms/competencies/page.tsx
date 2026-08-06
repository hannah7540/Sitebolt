"use client";

import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import CompetenciesPage from "@/components/administration/forms/CompetenciesPage";

export default function AdminCompetenciesRoute() {
  return (
    <AdminConsoleShell>
      <CompetenciesPage />
    </AdminConsoleShell>
  );
}
