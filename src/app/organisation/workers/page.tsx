"use client";

import { useCallback, useEffect, useState } from "react";
import WorkerDirectoryPanel from "@/components/workers/WorkerDirectoryPanel";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import { fetchAllWorkerVocs, type WorkerVoc } from "@/lib/supabase";

export default function OrganisationWorkersPage() {
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
