"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Calendar,
  Trash2,
  X,
} from "lucide-react";
import type { Worker, WorkerScheduleEntry, WorkerVoc } from "@/lib/supabase";
import { assignWorkerToProject, fetchWorkerSchedules } from "@/lib/supabase";
import { getProjectColor } from "@/lib/projects";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import {
  addDays,
  CALENDAR_DAY_COLUMN_WIDTH,
  formatWeekRange,
  getCalendarDaysInRange,
  getCalendarRangeEnd,
  getCalendarRangeStart,
  getDefaultCalendarAnchor,
  startOfWeekMonday,
  type CalendarDay,
} from "@/lib/scheduler-utils";
import HorizontalWorkerCalendarGrid, {
  SCROLL_EXTEND_DAYS,
} from "@/components/workers/HorizontalWorkerCalendarGrid";
import { expandProjectFilterIds } from "@/lib/project-filter-utils";
import { groupVocsByWorker } from "@/lib/voc-utils";
import {
  deleteWorkerCalendarEvent,
  fetchWorkerCalendarEvents,
  isLeaveCalendarEvent,
  primeWorkerCalendarEventsSchema,
  type WorkerCalendarEvent,
  type WorkerCalendarEventType,
} from "@/lib/worker-calendar-events";
import {
  fetchLeaveRequestById,
  fetchLeaveRequestsForCalendarRange,
  getLeaveStartDate,
  isLeaveRequestPending,
  mergeLeaveRequestsIntoCalendarEvents,
  resolveWorkerName,
} from "@/lib/leave-requests";
import { subscribeLeaveRequestsUpdated } from "@/lib/leave-events";
import LeaveRequestReviewModal from "@/components/dashboard/LeaveRequestReviewModal";
import type { LeaveRequest } from "@/lib/supabase";
import {
  HOLIDAY_APPROVED_STYLE,
} from "@/lib/calendar-event-styles";
import {
  findActiveCalendarEvents,
  resolveDayProjectAssignment,
  resolveWorkerDefaultProject,
  scheduleLeaveOnDay,
  scheduleLeaveToCalendarEvent,
  workerVisibleInCalendarFilter,
  type WorkerProjectMap,
} from "@/lib/worker-calendar-grid";
import { formatDateOnly } from "@/lib/scheduler-utils";
import {
  CALENDAR_LEGEND_ITEMS,
  getCalendarEventPresentation,
} from "@/lib/calendar-event-styles";
import { cn } from "@/lib/utils";
import { inputClass, modalOverlayClass, modalClass, labelClass } from "@/lib/ui-classes";

interface WorkerProjectSchedulerProps {
  workers: Worker[];
  workerVocs: WorkerVoc[];
  loading: boolean;
  onRefresh: () => void;
  filterProjectIds?: string[];
  title?: string;
  subtitle?: string;
  adminCalendarMode?: boolean;
  /** Junction table + default assignment map (Full Worker Calendar). */
  workerProjectMap?: WorkerProjectMap;
  /** Pre-fetched calendar events (optional — when omitted, fetched internally). */
  calendarEvents?: WorkerCalendarEvent[];
  /** Pre-fetched schedule rows (optional — when omitted, fetched internally). */
  schedules?: WorkerScheduleEntry[];
  /** Pre-fetched leave requests for badge rendering (optional). */
  leaveRequests?: LeaveRequest[];
  /** Pending leave requests for worker header alert bars (optional). */
  pendingLeaveRequests?: LeaveRequest[];
  /** Project list for name/color resolution when provided by parent. */
  projects?: DbProject[];
  /** Controlled calendar range start (optional — Full Worker Calendar). */
  calendarRangeStart?: Date;
  /** Controlled calendar range end (optional — Full Worker Calendar). */
  calendarRangeEnd?: Date;
  /** Called when the scroll range is extended past/future boundaries. */
  onCalendarRangeChange?: (rangeStart: Date, rangeEnd: Date) => void;
  /** @deprecated Use calendar scroll navigation instead. */
  weekStart?: Date;
  /** @deprecated Use calendar scroll navigation instead. */
  onWeekStartChange?: (weekStart: Date) => void;
  onReloadCalendar?: () => Promise<void>;
  onRefreshCalendar?: () => void | Promise<void>;
}

function CalendarEventPill({
  event,
  onClick,
}: {
  event: WorkerCalendarEvent;
  onClick?: () => void;
}) {
  const presentation = getCalendarEventPresentation(event);

  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "mb-0.5 block w-full rounded-full px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide",
        presentation.className
      )}
      style={presentation.style}
    >
      {presentation.label}
    </button>
  );
}

function CalendarLegendBar() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Legend
      </span>
      {CALENDAR_LEGEND_ITEMS.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <span
            className={cn(
              "inline-flex min-w-[2rem] items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              "className" in item ? item.className : undefined
            )}
            style={"style" in item ? item.style : undefined}
          >
            {item.sample}
          </span>
          {item.label}
        </span>
      ))}
    </div>
  );
}

function ProjectAssignmentCell({
  projectName,
  projectColor,
}: {
  projectName: string;
  projectColor: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[52px] flex-col items-center justify-center rounded-md border px-0.5 py-1 text-center text-[9px] font-bold uppercase leading-tight tracking-wide text-white",
        projectColor
      )}
      title={projectName}
    >
      <span className="line-clamp-3 break-words">{projectName}</span>
    </div>
  );
}

export default function WorkerProjectScheduler({
  workers,
  workerVocs,
  loading,
  onRefresh,
  filterProjectIds = [],
  title = "Worker Project Scheduler",
  subtitle = "Site allocations · project assignments · compliance overview",
  adminCalendarMode = false,
  workerProjectMap,
  calendarEvents: calendarEventsProp,
  schedules: schedulesProp,
  leaveRequests: leaveRequestsProp,
  pendingLeaveRequests: pendingLeaveRequestsProp,
  projects: projectsProp,
  calendarRangeStart: calendarRangeStartProp,
  calendarRangeEnd: calendarRangeEndProp,
  onCalendarRangeChange,
  onReloadCalendar,
  onRefreshCalendar,
}: WorkerProjectSchedulerProps) {
  const calendarAnchor = useMemo(() => getDefaultCalendarAnchor(), []);
  const scrollAdjustRef = useRef(0);
  const extendingPastRef = useRef(false);
  const extendingFutureRef = useRef(false);

  const [rangeStartInternal, setRangeStartInternal] = useState(() =>
    getCalendarRangeStart(calendarAnchor)
  );
  const [rangeEndInternal, setRangeEndInternal] = useState(() =>
    getCalendarRangeEnd(calendarAnchor)
  );

  const rangeStart = calendarRangeStartProp ?? rangeStartInternal;
  const rangeEnd = calendarRangeEndProp ?? rangeEndInternal;

  const setRange = useCallback(
    (nextStart: Date, nextEnd: Date) => {
      if (onCalendarRangeChange) {
        onCalendarRangeChange(nextStart, nextEnd);
        return;
      }
      setRangeStartInternal(nextStart);
      setRangeEndInternal(nextEnd);
    },
    [onCalendarRangeChange]
  );

  const calendarDays = useMemo(
    () => getCalendarDaysInRange(rangeStart, rangeEnd),
    [rangeStart, rangeEnd]
  );

  const [focusedWeekStart, setFocusedWeekStart] = useState(() =>
    startOfWeekMonday(new Date())
  );

  const vocsByWorker = useMemo(
    () => groupVocsByWorker(workerVocs),
    [workerVocs]
  );

  const usesExternalCalendarData =
    calendarEventsProp !== undefined && schedulesProp !== undefined;

  const [schedulesInternal, setSchedulesInternal] = useState<WorkerScheduleEntry[]>([]);
  const [calendarEventsInternal, setCalendarEventsInternal] = useState<
    WorkerCalendarEvent[]
  >([]);
  const [leaveRequestsInternal, setLeaveRequestsInternal] = useState<LeaveRequest[]>([]);
  const schedules = schedulesProp ?? schedulesInternal;
  const calendarEvents = calendarEventsProp ?? calendarEventsInternal;
  const leaveRequests = leaveRequestsProp ?? leaveRequestsInternal;
  const pendingLeaveRequests = useMemo(() => {
    if (pendingLeaveRequestsProp) {
      return pendingLeaveRequestsProp.filter((row) => isLeaveRequestPending(row.status));
    }
    return leaveRequests.filter((row) => isLeaveRequestPending(row.status));
  }, [pendingLeaveRequestsProp, leaveRequests]);

  const pendingLeavesByWorker = useMemo(() => {
    const map = new Map<string, LeaveRequest[]>();
    for (const request of pendingLeaveRequests) {
      const list = map.get(request.worker_id) ?? [];
      list.push(request);
      map.set(request.worker_id, list);
    }
    return map;
  }, [pendingLeaveRequests]);

  const [schedulesLoading, setSchedulesLoading] = useState(!usesExternalCalendarData);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [targetProjectId, setTargetProjectId] = useState<string>("");
  const [projectsInternal, setProjectsInternal] = useState<DbProject[]>(() =>
    getCachedProjects()
  );
  const projects = projectsProp ?? projectsInternal;
  const [roleOnSite, setRoleOnSite] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showRdos, setShowRdos] = useState(true);
  const [showLeaves, setShowLeaves] = useState(true);
  const [tradeFilter, setTradeFilter] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<WorkerCalendarEvent | null>(null);
  const [selectedLeaveRequest, setSelectedLeaveRequest] = useState<LeaveRequest | null>(
    null
  );
  const [leaveReviewWorkerName, setLeaveReviewWorkerName] = useState("Worker");
  const [deletingEvent, setDeletingEvent] = useState(false);

  const rangeStartIso = formatDateOnly(rangeStart);
  const rangeEndIso = formatDateOnly(rangeEnd);
  const focusedWeekStartIso = formatDateOnly(focusedWeekStart);
  const focusedWeekEndIso = formatDateOnly(addDays(focusedWeekStart, 6));

  const handleRangeExtendPast = useCallback(() => {
    if (extendingPastRef.current) return;
    extendingPastRef.current = true;

    const nextStart = addDays(rangeStart, -SCROLL_EXTEND_DAYS);
    scrollAdjustRef.current = SCROLL_EXTEND_DAYS * CALENDAR_DAY_COLUMN_WIDTH;
    setRange(nextStart, rangeEnd);

    window.setTimeout(() => {
      extendingPastRef.current = false;
    }, 500);
  }, [rangeEnd, rangeStart, setRange]);

  const handleRangeExtendFuture = useCallback(() => {
    if (extendingFutureRef.current) return;
    extendingFutureRef.current = true;

    const nextEnd = addDays(rangeEnd, SCROLL_EXTEND_DAYS);
    setRange(rangeStart, nextEnd);

    window.setTimeout(() => {
      extendingFutureRef.current = false;
    }, 500);
  }, [rangeEnd, rangeStart, setRange]);

  const loadSchedules = useCallback(async () => {
    if (usesExternalCalendarData) {
      if (onReloadCalendar) {
        await onReloadCalendar();
      }
      return;
    }

    setSchedulesLoading(true);
    await primeWorkerCalendarEventsSchema();
    const projectFilterId = filterProjectIds.length === 1 ? filterProjectIds[0] : undefined;
    const [scheduleData, eventData, leaveData] = await Promise.all([
      fetchWorkerSchedules(rangeStartIso, rangeEndIso),
      fetchWorkerCalendarEvents(rangeStartIso, rangeEndIso),
      fetchLeaveRequestsForCalendarRange(rangeStartIso, rangeEndIso, {
        projectId: projectFilterId,
      }),
    ]);

    setSchedulesInternal(scheduleData ?? []);
    setCalendarEventsInternal(eventData ?? []);
    setLeaveRequestsInternal(leaveData ?? []);
    setSchedulesLoading(false);
  }, [
    rangeStartIso,
    rangeEndIso,
    usesExternalCalendarData,
    onReloadCalendar,
    filterProjectIds,
  ]);

  useEffect(() => {
    if (usesExternalCalendarData) return;
    void loadSchedules();
  }, [loadSchedules, usesExternalCalendarData]);

  useEffect(() => {
    return subscribeLeaveRequestsUpdated(() => {
      void loadSchedules();
    });
  }, [loadSchedules]);

  useEffect(() => {
    if (projectsProp) return;
    fetchProjects().then((list) => {
      setProjectsInternal(list);
      if (list.length > 0 && !targetProjectId) {
        const def = list.find((p) => p.slug === "project-3") ?? list[0];
        setTargetProjectId(def.id);
      }
    });
  }, [targetProjectId, projectsProp]);

  useEffect(() => {
    if (workers.length > 0 && !selectedWorkerId) {
      setSelectedWorkerId(workers[0].id);
    }
  }, [workers, selectedWorkerId]);

  const workerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const worker of workers) {
      map.set(worker.id, worker.full_name?.trim() || resolveWorkerName(worker));
    }
    return map;
  }, [workers]);

  const mergedCalendarEvents = useMemo(
    () =>
      mergeLeaveRequestsIntoCalendarEvents(
        calendarEvents,
        leaveRequests,
        workerNameById
      ),
    [calendarEvents, leaveRequests, workerNameById]
  );

  const schedulesByWorker = useMemo(() => {
    const map = new Map<string, WorkerScheduleEntry[]>();
    for (const s of schedules) {
      const list = map.get(s.worker_id) ?? [];
      list.push(s);
      map.set(s.worker_id, list);
    }
    return map;
  }, [schedules]);

  const eventsByWorker = useMemo(() => {
    const map = new Map<string, WorkerCalendarEvent[]>();
    for (const event of mergedCalendarEvents) {
      const list = map.get(event.worker_id) ?? [];
      list.push(event);
      map.set(event.worker_id, list);
    }
    return map;
  }, [mergedCalendarEvents]);

  const tradeOptions = useMemo(() => {
    const trades = new Set<string>();
    for (const worker of workers) {
      const trade = worker.trade?.trim();
      if (trade) trades.add(trade);
    }
    return [...trades].sort();
  }, [workers]);

  const handleMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerId) return;
    const project = projects.find((p) => p.id === targetProjectId);
    if (!project) return;

    const selectedWorker = workers.find((worker) => worker.id === selectedWorkerId);
    const previousProjectId = selectedWorker?.assigned_project_id ?? null;

    setActionLoading(true);
    setActionMessage(null);
    const { error } = await assignWorkerToProject({
      workerId: selectedWorkerId,
      projectId: project.id,
      projectName: project.name,
      startDate: focusedWeekStartIso,
      endDate: focusedWeekEndIso,
      roleOnSite: roleOnSite || undefined,
    });
    setActionLoading(false);

    if (error) {
      setActionMessage(error);
      return;
    }

    void fetch("/api/workers/reallocate-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workerId: selectedWorkerId,
        projectId: project.id,
        projectName: project.name,
        effectiveDate: focusedWeekStartIso,
        previousProjectId,
      }),
    }).catch((notifyError) => {
      console.warn("Worker reallocation notification failed:", notifyError);
    });

    setActionMessage(`Worker assigned to ${project.name} for this week.`);
    await loadSchedules();
    onRefresh();
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
    setDeletingEvent(true);
    const { error, unavailable } = await deleteWorkerCalendarEvent(selectedEvent.id);
    setDeletingEvent(false);
    if (error) {
      setActionMessage(error);
      return;
    }
    setSelectedEvent(null);
    if (!unavailable) {
      await loadSchedules();
    }
  };

  const patchLocalCalendarEvent = useCallback(
    (leaveRequestId: string, result: "approved" | "rejected") => {
      const matchesLeaveRequest = (event: WorkerCalendarEvent) =>
        event.leave_request_id === leaveRequestId ||
        event.id === `leave-request-${leaveRequestId}`;

      const patchEvents = (events: WorkerCalendarEvent[]) => {
        if (result === "rejected") {
          return events.filter((event) => !matchesLeaveRequest(event));
        }

        return events.map((event) => {
          if (!matchesLeaveRequest(event)) return event;
          return {
            ...event,
            event_type: "Holiday Approved" as WorkerCalendarEventType,
            display_code: HOLIDAY_APPROVED_STYLE.displayCode,
            bg_color: HOLIDAY_APPROVED_STYLE.bgColor,
            text_color: HOLIDAY_APPROVED_STYLE.textColor,
            leave_kind: HOLIDAY_APPROVED_STYLE.kind,
            leave_status: "Approved" as const,
          };
        });
      };

      if (usesExternalCalendarData) return;
      setCalendarEventsInternal((current) => patchEvents(current));
      setLeaveRequestsInternal((current) => {
        if (result === "rejected") {
          return current.filter((row) => row.id !== leaveRequestId);
        }
        return current.map((row) =>
          row.id === leaveRequestId ? { ...row, status: "approved" } : row
        );
      });
    },
    [usesExternalCalendarData]
  );

  const resolveLeaveRequestId = (event: WorkerCalendarEvent): string | null => {
    if (event.leave_request_id) return event.leave_request_id;
    if (event.id.startsWith("leave-request-")) {
      return event.id.slice("leave-request-".length);
    }
    return null;
  };

  const handleOpenLeaveModal = useCallback(
    (leaveRequest: LeaveRequest) => {
      const worker = workers.find((row) => row.id === leaveRequest.worker_id);
      setLeaveReviewWorkerName(resolveWorkerName(worker ?? null));
      setSelectedLeaveRequest(leaveRequest);
    },
    [workers]
  );

  const handleLeaveEventClick = useCallback(
    async (event: WorkerCalendarEvent) => {
      const leaveRequestId = resolveLeaveRequestId(event);
      if (!leaveRequestId) {
        if (adminCalendarMode) setSelectedEvent(event);
        return;
      }

      const leaveRequest = await fetchLeaveRequestById(leaveRequestId);

      if (!leaveRequest) {
        setActionMessage("Could not load leave request details.");
        return;
      }

      const worker = workers.find((row) => row.id === event.worker_id);
      setLeaveReviewWorkerName(
        resolveWorkerName(worker ?? null, event.worker_name ?? undefined)
      );
      setSelectedLeaveRequest(leaveRequest);
    },
    [adminCalendarMode, workers]
  );

  const handleLeaveReviewUpdated = useCallback(
    async (result: "approved" | "rejected") => {
      if (selectedLeaveRequest) {
        patchLocalCalendarEvent(selectedLeaveRequest.id, result);
      }
      setSelectedLeaveRequest(null);
      await loadSchedules();
      onRefresh();
    },
    [selectedLeaveRequest, patchLocalCalendarEvent, loadSchedules, onRefresh]
  );

  const selectedWorker = workers.find((w) => w.id === selectedWorkerId);

  const projectFilterSet = useMemo(
    () => expandProjectFilterIds(filterProjectIds, projects),
    [filterProjectIds, projects]
  );

  const renderWorkerHeaderExtra = useCallback(
    (worker: Worker) => {
      const workerPendingLeaves = pendingLeavesByWorker.get(worker.id) ?? [];
      const defaultProject = resolveWorkerDefaultProject(
        worker,
        projects,
        projectFilterSet,
        workerProjectMap
      );

      return (
        <>
          {defaultProject ? (
            <p className="mt-0.5 truncate text-xs font-medium text-slate-600">
              {defaultProject.projectName}
            </p>
          ) : null}
          {workerPendingLeaves.map((req) => {
            const startDate = getLeaveStartDate(req);
            const totalDays = req.number_of_days || 1;

            return (
              <div
                key={req.id}
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  handleOpenLeaveModal(req);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    handleOpenLeaveModal(req);
                  }
                }}
                className="mt-1 cursor-pointer rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white shadow transition hover:bg-red-700"
              >
                Leave Req - {startDate} - {totalDays} day{totalDays > 1 ? "s" : ""}
              </div>
            );
          })}
        </>
      );
    },
    [
      pendingLeavesByWorker,
      projects,
      projectFilterSet,
      workerProjectMap,
      handleOpenLeaveModal,
    ]
  );

  const renderDayCell = useCallback(
    (worker: Worker, day: CalendarDay, weekDays: CalendarDay[]) => {
      const workerSchedules = schedulesByWorker.get(worker.id) ?? [];
      const cellDateStr = formatDateOnly(day.iso);
      const activeEvents = findActiveCalendarEvents(
        mergedCalendarEvents,
        worker.id,
        cellDateStr
      );

      const visibleDayEvents = activeEvents.filter((event) => {
        if (event.event_type === "RDO") {
          return showRdos || !adminCalendarMode;
        }
        if (isLeaveCalendarEvent(event)) {
          return showLeaves || !adminCalendarMode;
        }
        return true;
      });

      const dayLeaveSchedule =
        visibleDayEvents.length === 0 && (showLeaves || !adminCalendarMode)
          ? scheduleLeaveOnDay(workerSchedules, cellDateStr, projectFilterSet)
          : undefined;

      const hasCalendarLeave = visibleDayEvents.some((event) =>
        isLeaveCalendarEvent(event)
      );

      const projectAssignment =
        visibleDayEvents.length === 0 && !dayLeaveSchedule
          ? resolveDayProjectAssignment(
              worker,
              workerSchedules,
              cellDateStr,
              projects,
              projectFilterSet,
              weekDays,
              workerProjectMap
            )
          : null;

      const projectColor = projectAssignment
        ? getProjectColor(projectAssignment.projectId, projects)
        : "bg-slate-200/80 border-slate-300";

      return (
        <>
          {visibleDayEvents.map((event) => (
            <CalendarEventPill
              key={event.id}
              event={event}
              onClick={
                isLeaveCalendarEvent(event) || adminCalendarMode
                  ? () => void handleLeaveEventClick(event)
                  : undefined
              }
            />
          ))}
          {!hasCalendarLeave && dayLeaveSchedule ? (
            <CalendarEventPill
              event={scheduleLeaveToCalendarEvent(dayLeaveSchedule, worker)}
            />
          ) : null}
          {projectAssignment ? (
            <ProjectAssignmentCell
              projectName={projectAssignment.projectName}
              projectColor={projectColor}
            />
          ) : null}
        </>
      );
    },
    [
      adminCalendarMode,
      mergedCalendarEvents,
      projectFilterSet,
      projects,
      schedulesByWorker,
      showLeaves,
      showRdos,
      workerProjectMap,
      handleLeaveEventClick,
    ]
  );

  const visibleWorkers = useMemo(() => {
    let list = workers.filter(
      (worker) => worker.status !== "Revoked" && !worker.is_revoked
    );

    if (tradeFilter) {
      list = list.filter((worker) => worker.trade?.trim() === tradeFilter);
    }

    if (projectFilterSet.size === 0) return list;

    return list.filter((worker) =>
      workerVisibleInCalendarFilter({
        worker,
        schedules: schedulesByWorker.get(worker.id) ?? [],
        events: eventsByWorker.get(worker.id) ?? [],
        weekDays: calendarDays,
        projectFilterSet,
        workerProjectMap,
      })
    );
  }, [
    workers,
    tradeFilter,
    schedulesByWorker,
    eventsByWorker,
    calendarDays,
    projectFilterSet,
    workerProjectMap,
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-orange-500">{title}</h1>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>

      {adminCalendarMode ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Filters
          </span>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showRdos}
              onChange={(event) => setShowRdos(event.target.checked)}
              className="rounded border-slate-300 text-orange-500"
            />
            Show RDOs
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showLeaves}
              onChange={(event) => setShowLeaves(event.target.checked)}
              className="rounded border-slate-300 text-orange-500"
            />
            Show Leaves
          </label>
          <select
            className={`${inputClass} w-auto min-w-[140px] py-1.5 text-sm`}
            value={tradeFilter}
            onChange={(event) => setTradeFilter(event.target.value)}
          >
            <option value="">All trades</option>
            {tradeOptions.map((trade) => (
              <option key={trade} value={trade}>
                {trade}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <CalendarLegendBar />

      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1">
          <HorizontalWorkerCalendarGrid
            calendarDays={calendarDays}
            calendarRangeStart={rangeStart}
            calendarRangeEnd={rangeEnd}
            loading={loading || schedulesLoading}
            visibleWorkers={visibleWorkers}
            selectedWorkerId={selectedWorkerId}
            onSelectWorker={setSelectedWorkerId}
            vocsByWorker={vocsByWorker}
            renderDayCell={renderDayCell}
            onRangeExtendPast={handleRangeExtendPast}
            onRangeExtendFuture={handleRangeExtendFuture}
            scrollAdjustRef={scrollAdjustRef}
            onFocusedWeekChange={setFocusedWeekStart}
            renderWorkerHeaderExtra={
              adminCalendarMode ? renderWorkerHeaderExtra : undefined
            }
          />
        </div>

        <aside className="w-full shrink-0 xl:w-80">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-orange-500">
              <Calendar className="h-4 w-4" /> Move Worker to Project
            </h2>

            {selectedWorker && (
              <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Selected:{" "}
                <strong className="text-slate-900">{selectedWorker.full_name}</strong>
              </p>
            )}

            {actionMessage && (
              <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {actionMessage}
              </p>
            )}

            <form onSubmit={handleMove} className="space-y-3">
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                className={inputClass}
              >
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.full_name}
                  </option>
                ))}
              </select>
              <select
                value={targetProjectId}
                onChange={(e) => setTargetProjectId(e.target.value)}
                className={inputClass}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Role on site (optional)"
                value={roleOnSite}
                onChange={(e) => setRoleOnSite(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-slate-500">
                Assigns worker for {formatWeekRange(focusedWeekStart)}
              </p>
              <button
                type="submit"
                disabled={actionLoading || !selectedWorkerId}
                className="w-full rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
              >
                {actionLoading ? "Saving…" : "Move to Project"}
              </button>
            </form>
          </div>
        </aside>
      </div>

      {selectedLeaveRequest ? (
        <LeaveRequestReviewModal
          leaveRequest={selectedLeaveRequest}
          workerName={leaveReviewWorkerName}
          onClose={() => setSelectedLeaveRequest(null)}
          onUpdated={(result) => void handleLeaveReviewUpdated(result)}
          onRefreshCalendar={() => {
            void loadSchedules();
            if (onRefreshCalendar) {
              void onRefreshCalendar();
            }
          }}
        />
      ) : null}

      {selectedEvent && !selectedLeaveRequest ? (
        <div className={modalOverlayClass} onClick={() => setSelectedEvent(null)}>
          <div
            className={`${modalClass} max-w-md`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedEvent.event_type === "RDO" ? "RDO Details" : "Leave Details"}
                </h3>
                <span
                  className={cn(
                    "mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase",
                    getCalendarEventPresentation(selectedEvent).className
                  )}
                  style={getCalendarEventPresentation(selectedEvent).style}
                >
                  {getCalendarEventPresentation(selectedEvent).label}
                </span>
              </div>
              <button type="button" onClick={() => setSelectedEvent(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className={labelClass}>Worker</dt>
                <dd className="text-slate-900">{selectedEvent.worker_name ?? "—"}</dd>
              </div>
              <div>
                <dt className={labelClass}>Project</dt>
                <dd className="text-slate-900">{selectedEvent.project_name ?? "—"}</dd>
              </div>
              <div>
                <dt className={labelClass}>Date</dt>
                <dd className="text-slate-900">
                  {selectedEvent.start_date === selectedEvent.end_date
                    ? selectedEvent.start_date
                    : `${selectedEvent.start_date} → ${selectedEvent.end_date}`}
                  {!selectedEvent.is_full_day && selectedEvent.start_time
                    ? ` (${selectedEvent.start_time}–${selectedEvent.end_time ?? ""})`
                    : null}
                </dd>
              </div>
              {selectedEvent.notes ? (
                <div>
                  <dt className={labelClass}>Notes</dt>
                  <dd className="text-slate-900">{selectedEvent.notes}</dd>
                </div>
              ) : null}
            </dl>
            <button
              type="button"
              disabled={deletingEvent}
              onClick={() => void handleDeleteEvent()}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {deletingEvent ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remove / Delete Entry
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
