"use client";

import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import InductionFormsPage from "@/components/administration/forms/InductionFormsPage";

export default function AdminInductionFormsRoute() {
  return (
    <AdminConsoleShell>
      <InductionFormsPage />
    </AdminConsoleShell>
  );
}
