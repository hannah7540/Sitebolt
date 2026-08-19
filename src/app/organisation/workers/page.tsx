"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import WorkerDirectoryPanel from "@/components/workers/WorkerDirectoryPanel";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import { fetchAllWorkerVocs, type WorkerVoc } from "@/lib/supabase";

function OrganisationWorkersContent() {
  const { workers, loading } = useAdminConsole();
  const [workerVocs, setWorkerVocs] = useState<WorkerVoc[]>([]);
  const [vocsLoading, setVocsLoading] = useState(true);

  const loadVocs = useCallback(async () => {
    setVocsLoading(true);
    try {
      const rows = await fetchAllWorkerVocs();
      setWorkerVocs(rows ?? []);
    } catch (error) {
      console.error("Failed to load worker VOCs:", error);
      setWorkerVocs([]);
    } finally {
      setVocsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVocs();
  }, [loadVocs]);

  return (
    <WorkerDirectoryPanel
      workers={workers}
      workerVocs={workerVocs}
      loading={loading || vocsLoading}
      onRefresh={() => {
        void loadVocs();
      }}
    />
  );
}

export default function OrganisationWorkersPage() {
  return (
    <AdminConsoleShell requireOrganisationAccess>
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading workers…
          </div>
        }
      >
        <OrganisationWorkersContent />
      </Suspense>
    </AdminConsoleShell>
  );
}
