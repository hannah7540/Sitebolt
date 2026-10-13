"use client";

import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import AdminConsoleViewGate from "@/components/layout/AdminConsoleViewGate";
import AdminReportingTab from "@/components/administration/AdminReportingTab";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import { DEFAULT_ADMIN_PROFILE_NAME } from "@/lib/user-session";
import { getWorkerDisplayName } from "@/lib/worker-utils";

function AdminReportingContent() {
  const { projects, workers, adminWorkerId } = useAdminConsole();
  const actionedBy = workers.find((worker) => worker.id === adminWorkerId);

  return (
    <AdminReportingTab
      projects={projects}
      actionedById={adminWorkerId}
      actionedByName={actionedBy ? getWorkerDisplayName(actionedBy) : DEFAULT_ADMIN_PROFILE_NAME}
    />
  );
}

export default function AdminReportingPage() {
  return (
    <AdminConsoleShell>
      <AdminConsoleViewGate>
        <AdminReportingContent />
      </AdminConsoleViewGate>
    </AdminConsoleShell>
  );
}
