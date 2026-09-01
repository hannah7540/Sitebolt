"use client";

import { Loader2 } from "lucide-react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import MasterProjectDashboard from "@/components/administration/MasterProjectDashboard";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";

function MasterProjectDashboardContent() {
  const { loading, sessionReady, accessDenied } = useAdminConsole();

  if (loading || !sessionReady) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading administration session…
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {accessDenied}
      </div>
    );
  }

  return <MasterProjectDashboard />;
}

export default function AdminMasterProjectDashboardPage() {
  return (
    <AdminConsoleShell>
      <MasterProjectDashboardContent />
    </AdminConsoleShell>
  );
}
