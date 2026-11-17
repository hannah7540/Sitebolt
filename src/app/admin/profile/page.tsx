"use client";

import { Loader2 } from "lucide-react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import WorkerDashboardView from "@/components/workers/WorkerDashboardView";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";

function AdminProfileContent() {
  const { loading, sessionReady, accessDenied, adminWorkerId, sessionRole } =
    useAdminConsole();

  if (loading || !sessionReady) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading profile…
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

  return (
    <WorkerDashboardView
      workerId={adminWorkerId}
      embedded
      preferAdminProfile
      sessionRole={sessionRole}
    />
  );
}

export default function AdminProfilePage() {
  return (
    <AdminConsoleShell>
      <AdminProfileContent />
    </AdminConsoleShell>
  );
}
