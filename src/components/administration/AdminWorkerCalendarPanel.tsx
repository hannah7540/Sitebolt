"use client";

import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import CompanyCalendarHolidaysPanel from "@/components/administration/CompanyCalendarHolidaysPanel";
import ProjectMultiSelect from "@/components/administration/ProjectMultiSelect";
import { CalendarSkeleton } from "@/components/ui/RouteLoadingFallback";
import type { Worker, WorkerVoc } from "@/lib/supabase";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import { primeWorkerCalendarEventsSchema } from "@/lib/worker-calendar-events";
import { cn } from "@/lib/utils";

const FullWorkerCalendarView = lazy(
  () => import("@/components/administration/FullWorkerCalendarView")
);

type LeaveManagementTab = "calendar" | "holidays";

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
  const [tab, setTab] = useState<LeaveManagementTab>("calendar");

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
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("calendar")}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-semibold",
            tab === "calendar"
              ? "bg-orange-500 text-white"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          )}
        >
          Worker Calendar
        </button>
        <button
          type="button"
          onClick={() => setTab("holidays")}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-semibold",
            tab === "holidays"
              ? "bg-orange-500 text-white"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          )}
        >
          Company Calendar & Holidays
        </button>
      </div>

      {tab === "holidays" ? (
        <CompanyCalendarHolidaysPanel />
      ) : (
        <>
          <ProjectMultiSelect
            projects={projects}
            selectedProjectIds={selectedProjectIds}
            onChange={setSelectedProjectIds}
          />

          <Suspense fallback={<CalendarSkeleton label="Loading full worker calendar…" />}>
            <FullWorkerCalendarView
              workers={workers}
              workerVocs={workerVocs}
              loading={loading}
              onRefresh={handleCalendarSaved}
              filterProjectIds={effectiveFilter}
              refreshToken={refreshToken}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}
