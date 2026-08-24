"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import WorkerProjectScheduler from "@/components/workers/WorkerProjectScheduler";
import BulkRdoModal from "@/components/administration/BulkRdoModal";
import AddOtherLeaveModal from "@/components/administration/AddOtherLeaveModal";
import CalendarExpandShell from "@/components/administration/CalendarExpandShell";
import type { Worker, WorkerScheduleEntry, WorkerVoc } from "@/lib/supabase";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import {
  buildWorkerProjectMap,
  fetchProjectWorkerAssignments,
} from "@/lib/project-assignments";
import { subscribeLeaveRequestsUpdated } from "@/lib/leave-events";
import {
  fetchLeaveRequestsForCalendarRange,
  fetchPendingLeaveRequests,
} from "@/lib/leave-requests";
import type { LeaveRequest } from "@/lib/supabase";
import {
  fetchWorkerCalendarEvents,
  insertBulkLeaveEvents,
  insertBulkRdoEvents,
  primeWorkerCalendarEventsSchema,
  type BulkLeaveInput,
  type BulkRdoInput,
  type WorkerCalendarEvent,
} from "@/lib/worker-calendar-events";
import { fetchWorkerSchedules } from "@/lib/supabase";
import type { WorkerProjectMap } from "@/lib/worker-calendar-grid";
import {
  formatDateOnly,
  getCalendarRangeEnd,
  getCalendarRangeStart,
  getDefaultCalendarAnchor,
} from "@/lib/scheduler-utils";

export interface FullWorkerCalendarViewProps {
  workers: Worker[];
  workerVocs: WorkerVoc[];
  loading: boolean;
  onRefresh: () => void;
  filterProjectIds?: string[];
  refreshToken?: number;
}

export default function FullWorkerCalendarView({
  workers,
  workerVocs,
  loading,
  onRefresh,
  filterProjectIds = [],
  refreshToken = 0,
}: FullWorkerCalendarViewProps) {
  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());
  const [workerProjectMap, setWorkerProjectMap] = useState<WorkerProjectMap>(
    () => new Map()
  );
  const [calendarEvents, setCalendarEvents] = useState<WorkerCalendarEvent[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState<LeaveRequest[]>([]);
  const [schedules, setSchedules] = useState<WorkerScheduleEntry[]>([]);
  const calendarAnchor = useMemo(() => getDefaultCalendarAnchor(), []);
  const [rangeStart, setRangeStart] = useState(() =>
    getCalendarRangeStart(calendarAnchor)
  );
  const [rangeEnd, setRangeEnd] = useState(() => getCalendarRangeEnd(calendarAnchor));
  const [showBulkRdo, setShowBulkRdo] = useState(false);
  const [showOtherLeave, setShowOtherLeave] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const rangeStartIso = formatDateOnly(rangeStart);
  const rangeEndIso = formatDateOnly(rangeEnd);

  const handleCalendarRangeChange = useCallback((start: Date, end: Date) => {
    setRangeStart(start);
    setRangeEnd(end);
  }, []);

  const [calendarLoading, setCalendarLoading] = useState(true);

  const fetchCalendarEvents = useCallback(async () => {
    if (!rangeStartIso || !rangeEndIso) return [];

    try {
      const events = await fetchWorkerCalendarEvents(rangeStartIso, rangeEndIso);
      setCalendarEvents(events);
      return events;
    } catch (error) {
      console.warn(
        "[FullWorkerCalendar] fetchCalendarEvents failed; using empty fallback.",
        error
      );
      setCalendarEvents([]);
      return [];
    }
  }, [rangeStartIso, rangeEndIso]);

  const loadCalendarData = useCallback(async () => {
    if (!rangeStartIso || !rangeEndIso) return;

    setCalendarLoading(true);

    try {
      await primeWorkerCalendarEventsSchema();

      const [projectRows, scheduleData, projectList, leaveData, pendingLeaveData] =
        await Promise.all([
        fetchProjectWorkerAssignments(),
        fetchWorkerSchedules(rangeStartIso, rangeEndIso),
        fetchProjects(),
        fetchLeaveRequestsForCalendarRange(rangeStartIso, rangeEndIso),
        fetchPendingLeaveRequests(),
      ]);

      const assignmentMap = buildWorkerProjectMap(projectRows);
      const safeSchedules = scheduleData ?? [];

      setProjects(projectList);
      setWorkerProjectMap(assignmentMap);
      setSchedules(safeSchedules);
      setLeaveRequests(leaveData ?? []);
      setPendingLeaveRequests(pendingLeaveData ?? []);

      await fetchCalendarEvents();
    } catch (error) {
      console.warn(
        "[FullWorkerCalendar] loadCalendarData failed; using empty fallback.",
        error
      );
      setCalendarEvents([]);
      setLeaveRequests([]);
      setPendingLeaveRequests([]);
      setSchedules([]);
      setWorkerProjectMap(new Map());
    } finally {
      setCalendarLoading(false);
    }
  }, [rangeStartIso, rangeEndIso, fetchCalendarEvents]);

  useEffect(() => {
    void loadCalendarData();
  }, [loadCalendarData, refreshToken]);

  useEffect(() => {
    return subscribeLeaveRequestsUpdated(() => {
      void loadCalendarData();
    });
  }, [loadCalendarData]);

  const handleAddRDO = useCallback(
    async (input: BulkRdoInput) => {
      const normalizedInput: BulkRdoInput = {
        ...input,
        startDate: formatDateOnly(input.startDate),
        endDate: formatDateOnly(input.endDate),
        workers: input.workers
          .filter((worker) => worker?.id)
          .map((worker) => ({
            ...worker,
            id: String(worker.id).trim(),
          })),
      };

      const result = await insertBulkRdoEvents(normalizedInput);
      if (result.error) {
        console.error("Error saving calendar event:", result.error);
        return result;
      }
      if (result.created > 0) {
        await loadCalendarData();
      }
      return result;
    },
    [loadCalendarData]
  );

  const handleAddOtherLeave = useCallback(
    async (input: BulkLeaveInput) => {
      const normalizedInput: BulkLeaveInput = {
        ...input,
        startDate: formatDateOnly(input.startDate),
        endDate: formatDateOnly(input.endDate),
        workers: input.workers
          .filter((worker) => worker?.id)
          .map((worker) => ({
            ...worker,
            id: String(worker.id).trim(),
          })),
      };

      const result = await insertBulkLeaveEvents(normalizedInput);
      if (result.error) {
        console.error("Error saving calendar event:", result.error);
        return result;
      }
      if (result.created > 0) {
        await loadCalendarData();
      }
      return result;
    },
    [loadCalendarData]
  );

  const handleCalendarSaved = async () => {
    await loadCalendarData();
    onRefresh();
  };

  return (
    <CalendarExpandShell
      expanded={expanded}
      onExpandedChange={setExpanded}
      title={
        <h1 className="text-3xl font-bold text-slate-900">
          Full Worker <span className="text-orange-500">Calendar</span>
        </h1>
      }
      subtitle="Worker allocations, RDO blocks, and leave across selected projects."
      toolbar={
        <>
          <button
            type="button"
            onClick={() => setShowBulkRdo(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            Add RDO
          </button>
          <button
            type="button"
            onClick={() => setShowOtherLeave(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-orange-300 bg-white px-4 py-2.5 text-sm font-semibold text-orange-600 shadow-sm hover:bg-orange-50"
          >
            <Plus className="h-4 w-4" />
            Add Other Leave
          </button>
        </>
      }
    >
      <WorkerProjectScheduler
        workers={workers}
        workerVocs={workerVocs}
        loading={loading || calendarLoading}
        onRefresh={() => void loadCalendarData()}
        filterProjectIds={filterProjectIds}
        title="Full Worker Calendar"
        subtitle="Worker allocations, RDO blocks, and leave across selected projects"
        adminCalendarMode
        hideTitle
        scrollMaxHeightClass={
          expanded ? "max-h-[calc(92vh-16rem)]" : undefined
        }
        workerProjectMap={workerProjectMap}
        calendarEvents={calendarEvents}
        leaveRequests={leaveRequests}
        pendingLeaveRequests={pendingLeaveRequests}
        schedules={schedules}
        projects={projects}
        calendarRangeStart={rangeStart}
        calendarRangeEnd={rangeEnd}
        onCalendarRangeChange={handleCalendarRangeChange}
        onReloadCalendar={loadCalendarData}
        onRefreshCalendar={loadCalendarData}
      />

      {showBulkRdo ? (
        <BulkRdoModal
          workers={workers}
          projects={projects}
          onClose={() => setShowBulkRdo(false)}
          onSaved={() => void handleCalendarSaved()}
          onSubmit={handleAddRDO}
        />
      ) : null}

      {showOtherLeave ? (
        <AddOtherLeaveModal
          workers={workers}
          onClose={() => setShowOtherLeave(false)}
          onSaved={() => void handleCalendarSaved()}
          onSubmit={handleAddOtherLeave}
        />
      ) : null}
    </CalendarExpandShell>
  );
}