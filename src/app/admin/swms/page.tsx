"use client";

import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import AdminConsoleViewGate from "@/components/layout/AdminConsoleViewGate";
import SwmsManagementPanel from "@/components/administration/SwmsManagementPanel";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";

function AdminSwmsContent() {
  const { workers, projects } = useAdminConsole();
  return <SwmsManagementPanel workers={workers} projects={projects} />;
}

export default function AdminSwmsPage() {
  return (
    <AdminConsoleShell>
      <AdminConsoleViewGate>
        <AdminSwmsContent />
      </AdminConsoleViewGate>
    </AdminConsoleShell>
  );
}
