"use client";

import { useEffect, useMemo, useState } from "react";
import FullWorkerCalendarView from "@/components/administration/FullWorkerCalendarView";
import ProjectMultiSelect from "@/components/administration/ProjectMultiSelect";
import type { Worker, WorkerVoc } from "@/lib/supabase";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import { primeWorkerCalendarEventsSchema } from "@/lib/worker-calendar-events";

interface AdminWorkerCalendarPanelProps {
  workers: Worker[];
  workerVocs: WorkerVoc[];
  loading: boolean;
  onRefresh: () => void;
}

export default function AdminWorkerCalendarPanel({
  workers,
  workerVocs,
  loading,
  onRefresh,
}: AdminWorkerCalendarPanelProps) {
  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    void primeWorkerCalendarEventsSchema();
    fetchProjects().then((list) => {
      setProjects(list);
      setSelectedProjectIds(list.map((project) => project.id));
    });
  }, []);

  const effectiveFilter = useMemo(() => {
    if (selectedProjectIds.length === 0) return [];
    if (selectedProjectIds.length === projects.length) return [];
    return selectedProjectIds;
  }, [selectedProjectIds, projects.length]);

  const handleCalendarSaved = () => {
    setRefreshToken((token) => token + 1);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <ProjectMultiSelect
        projects={projects}
        selectedProjectIds={selectedProjectIds}
        onChange={setSelectedProjectIds}
      />

      <FullWorkerCalendarView
        workers={workers}
        workerVocs={workerVocs}
        loading={loading}
        onRefresh={handleCalendarSaved}
        filterProjectIds={effectiveFilter}
        refreshToken={refreshToken}
      />
    </div>
  );
}
