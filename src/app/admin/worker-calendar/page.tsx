"use client";

import { useCallback, useEffect, useState } from "react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import AdminConsoleViewGate from "@/components/layout/AdminConsoleViewGate";
import AdminWorkerCalendarPanel from "@/components/administration/AdminWorkerCalendarPanel";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import { fetchAllWorkerVocs, type WorkerVoc } from "@/lib/supabase";

function AdminWorkerCalendarContent() {
  const { workers, loading } = useAdminConsole();
  const [workerVocs, setWorkerVocs] = useState<WorkerVoc[]>([]);
  const [vocsLoading, setVocsLoading] = useState(true);

  const loadVocs = useCallback(async () => {
    setVocsLoading(true);
    setWorkerVocs(
      await fetchAllWorkerVocs({
        workerIds: workers.map((worker) => worker.id),
      })
    );
    setVocsLoading(false);
  }, [workers]);

  useEffect(() => {
    if (loading) return;
    void loadVocs();
  }, [loadVocs, loading]);

  return (
    <AdminWorkerCalendarPanel
      workers={workers}
      workerVocs={workerVocs}
      loading={loading || vocsLoading}
      onRefresh={loadVocs}
    />
  );
}

export default function AdminWorkerCalendarPage() {
  return (
    <AdminConsoleShell>
      <AdminConsoleViewGate>
        <AdminWorkerCalendarContent />
      </AdminConsoleViewGate>
    </AdminConsoleShell>
  );
}
