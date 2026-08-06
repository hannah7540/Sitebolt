"use client";

import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import RequestsPage from "@/components/administration/forms/RequestsPage";

export default function AdminRequestsFormsRoute() {
  return (
    <AdminConsoleShell>
      <RequestsPage />
    </AdminConsoleShell>
  );
}
