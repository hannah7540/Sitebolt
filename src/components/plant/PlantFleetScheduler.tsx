"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Loader2, Truck, Wrench } from "lucide-react";
import type { PlantAsset, PlantPrestart } from "@/lib/supabase";
import { assignPlantToProject, fetchPlantPrestarts, resolvePlantPrestartDefect } from "@/lib/supabase";
import {
  buildPlantServiceCreateInput,
  createPlantServiceSchedule,
  fetchActivePlantServiceSchedules,
  fetchServiceSchedules,
  formatBookedServiceDate,
  indexBookedServicesByPlant,
  isUpcomingHeaderBookedService,
  resolveBookedServiceForPlant,
  type PlantServiceSchedule,
} from "@/lib/plant-services";
import { getServiceWarning } from "@/lib/plant-utils";
import { SERVICE_TYPES } from "@/lib/projects";
import {
  fetchProjects,
  getCachedProjects,
  type DbProject,
} from "@/lib/project-resolver";
import {
  addDays,
  CALENDAR_DAY_COLUMN_WIDTH,
  CALENDAR_WEEKDAY_SCROLL_EXTEND,
  filterWeekdayCalendarDays,
  formatDateOnly,
  formatWeekRange,
  getCalendarDaysInRange,
  getCalendarRangeEnd,
  getCalendarRangeStart,
  getDefaultCalendarAnchor,
  getFleetStatusLabel,
  isWeekendIso,
  startOfWeekMonday,
  type CalendarDay,
} from "@/lib/scheduler-utils";
import {
  expandProjectFilterIds,
  matchesProjectFilter,
} from "@/lib/project-filter-utils";
import {
  resolvePlantAssignedProjectId,
  resolvePlantAssignedProjectName,
} from "@/lib/project-assignments";
import HorizontalCalendarGrid, {
  SCROLL_EXTEND_DAYS,
} from "@/components/shared/HorizontalCalendarGrid";
import PlantPrestartDetailModal from "@/components/dashboard/PlantPrestartDetailModal";
import PlantDefectResolveModal from "@/components/plant/PlantDefectResolveModal";
import {
  applyResolvedPrestartPatch,
  formatLastPrestartColumnLabel,
  formatPrestartHours,
  getLatestPrestartByPlant,
  getPlantCalendarHeaderAlerts,
  getPrestartDefectLabel,
  groupPrestartsByPlantDate,
  isCalendarDefectPrestart,
  isResolvedPrestartDefect,
} from "@/lib/plant-prestart-utils";
import { cn } from "@/lib/utils";
import { cardClass, inputClass } from "@/lib/ui-classes";

interface PlantFleetSchedulerProps {
  plant: PlantAsset[];
  loading: boolean;
  onRefresh: () => void;
  filterProjectIds?: string[];
  title?: string;
  subtitle?: string;
  /** Mon–Fri columns only; weekend cells stay empty for project badges. */
  weekdaysOnly?: boolean;
  /** Red defect / service-due badges under unit name in pinned column. */
  showHeaderAlerts?: boolean;
  /** Hide the scheduler's own title block when parent provides the heading. */
  hideTitle?: boolean;
  /** Passed through to the calendar scroll container. */
  scrollMaxHeightClass?: string;
}

function PlantProjectAssignmentCell({
  projectName,
  compact = false,
}: {
  projectName: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md bg-orange-600 px-0.5 py-1 text-center text-[9px] font-bold uppercase leading-tight tracking-wide text-white",
        compact ? "mb-0.5 w-full" : "min-h-[52px]"
      )}
      title={projectName}
    >
      <span className={cn(compact ? "line-clamp-2" : "line-clamp-3", "break-words")}>
        {projectName}
      </span>
    </div>
  );
}

function PlantServiceBadge({ schedule }: { schedule: PlantServiceSchedule }) {
  return (
    <div
      className="mb-0.5 w-full rounded bg-amber-500 px-1 py-0.5 text-center text-[9px] font-bold uppercase text-white"
      title={`${schedule.service_type}${
        schedule.technician_notes ? `: ${schedule.technician_notes}` : ""
      }`}
    >
      {schedule.service_type || "SERVICE"}
    </div>
  );
}

function PlantDefectBadge({
  prestart,
  onSelect,
}: {
  prestart: PlantPrestart;
  onSelect: (prestart: PlantPrestart) => void;
}) {
  const resolved = isResolvedPrestartDefect(prestart);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(prestart);
      }}
      className={cn(
        "mb-0.5 w-full rounded px-1 py-0.5 text-center text-[9px] font-bold uppercase text-white",
        resolved ? "bg-orange-600/70 hover:bg-orange-600/80" : "bg-orange-600 hover:bg-orange-500"
      )}
      title={prestart.defect_comments ?? getPrestartDefectLabel(prestart)}
    >
      {getPrestartDefectLabel(prestart)}
      {resolved ? (
        <span className="mt-0.5 block text-[8px] font-bold normal-case tracking-normal text-white/90">
          ✓ Resolved
        </span>
      ) : null}
    </button>
  );
}

function resolveDayPlantProjectAssignment(
  asset: PlantAsset,
  dayIso: string,
  projectFilterSet: Set<string>
): { projectId: string; projectName: string } | null {
  // Default project badges Mon–Fri only; weekend cells stay blank unless
  // an explicit defect or service event exists for that date.
  if (isWeekendIso(dayIso)) {
    return null;
  }

  const projectId = resolvePlantAssignedProjectId(asset);
  if (!projectId || !matchesProjectFilter(projectId, projectFilterSet)) {
    return null;
  }

  const projectName = resolvePlantAssignedProjectName(asset);
  if (!projectName || projectName === "Unassigned") {
    return null;
  }

  return { projectId, projectName };
}

export default function PlantFleetScheduler({
  plant,
  loading,
  onRefresh,
  filterProjectIds = [],
  title = "Plant Scheduling Dashboard",
  subtitle = "Fleet allocation · project assignments · service milestones",
  weekdaysOnly = false,
  showHeaderAlerts = false,
  hideTitle = false,
  scrollMaxHeightClass,
}: PlantFleetSchedulerProps) {
  const calendarAnchor = useMemo(() => getDefaultCalendarAnchor(), []);
  const scrollAdjustRef = useRef(0);
  const extendingPastRef = useRef(false);
  const extendingFutureRef = useRef(false);

  const [rangeStart, setRangeStart] = useState(() =>
    getCalendarRangeStart(calendarAnchor)
  );
  const [rangeEnd, setRangeEnd] = useState(() => getCalendarRangeEnd(calendarAnchor));
  const [focusedWeekStart, setFocusedWeekStart] = useState(() =>
    startOfWeekMonday(new Date())
  );

  const calendarDays = useMemo(() => {
    const days = getCalendarDaysInRange(rangeStart, rangeEnd);
    return weekdaysOnly ? filterWeekdayCalendarDays(days) : days;
  }, [rangeStart, rangeEnd, weekdaysOnly]);

  const rangeStartIso = formatDateOnly(rangeStart);
  const rangeEndIso = formatDateOnly(rangeEnd);

  const [schedules, setSchedules] = useState<PlantServiceSchedule[]>([]);
  const [bookedServices, setBookedServices] = useState<PlantServiceSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [schedulesUnavailable, setSchedulesUnavailable] = useState(false);
  const [selectedPlantId, setSelectedPlantId] = useState("");
  const [targetProjectId, setTargetProjectId] = useState<string>("");
  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());
  const [serviceDate, setServiceDate] = useState("");
  const [serviceType, setServiceType] = useState<string>(SERVICE_TYPES[0]);
  const [technicianNotes, setTechnicianNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [prestarts, setPrestarts] = useState<PlantPrestart[]>([]);
  const [latestPrestartsByPlant, setLatestPrestartsByPlant] = useState<
    Map<string, PlantPrestart>
  >(() => new Map());
  const [prestartsLoading, setPrestartsLoading] = useState(true);
  const [selectedPrestart, setSelectedPrestart] = useState<PlantPrestart | null>(null);
  const [resolveDefectTarget, setResolveDefectTarget] = useState<{
    plant: PlantAsset;
    prestart: PlantPrestart;
  } | null>(null);

  const handleRangeExtendPast = useCallback(() => {
    if (extendingPastRef.current) return;
    extendingPastRef.current = true;

    setRangeStart((current) => addDays(current, -SCROLL_EXTEND_DAYS));
    scrollAdjustRef.current =
      (weekdaysOnly ? CALENDAR_WEEKDAY_SCROLL_EXTEND : SCROLL_EXTEND_DAYS) *
      CALENDAR_DAY_COLUMN_WIDTH;

    window.setTimeout(() => {
      extendingPastRef.current = false;
    }, 500);
  }, [weekdaysOnly]);

  const handleRangeExtendFuture = useCallback(() => {
    if (extendingFutureRef.current) return;
    extendingFutureRef.current = true;

    setRangeEnd((current) => addDays(current, SCROLL_EXTEND_DAYS));

    window.setTimeout(() => {
      extendingFutureRef.current = false;
    }, 500);
  }, []);

  const loadSchedules = useCallback(async () => {
    setSchedulesLoading(true);
    setSchedulesUnavailable(false);
    try {
      const todayIso = formatDateOnly(new Date());
      const [rangeData, activeBookings] = await Promise.all([
        fetchServiceSchedules(rangeStartIso, rangeEndIso),
        showHeaderAlerts
          ? fetchActivePlantServiceSchedules(todayIso)
          : Promise.resolve([] as PlantServiceSchedule[]),
      ]);
      setSchedules(Array.isArray(rangeData) ? rangeData : []);
      setBookedServices(activeBookings);
    } catch {
      setSchedules([]);
      setBookedServices([]);
      setSchedulesUnavailable(true);
    } finally {
      setSchedulesLoading(false);
    }
  }, [rangeEndIso, rangeStartIso, showHeaderAlerts]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  const loadPrestarts = useCallback(async () => {
    setPrestartsLoading(true);
    try {
      const plantIds = plant.map((asset) => asset.id);
      const [rangeData, latestData] = await Promise.all([
        fetchPlantPrestarts({
          plantIds: plantIds.length > 0 ? plantIds : undefined,
          startDate: rangeStartIso,
          endDate: rangeEndIso,
          limit: 1000,
        }),
        // Absolute latest per plant (not range-scoped) for hours / service / last pre-start.
        fetchPlantPrestarts({
          plantIds: plantIds.length > 0 ? plantIds : undefined,
          limit: Math.max(plantIds.length * 3, 200),
        }),
      ]);
      setPrestarts(rangeData);
      setLatestPrestartsByPlant(getLatestPrestartByPlant(latestData));
    } catch {
      setPrestarts([]);
      setLatestPrestartsByPlant(new Map());
    } finally {
      setPrestartsLoading(false);
    }
  }, [plant, rangeEndIso, rangeStartIso]);

  useEffect(() => {
    void loadPrestarts();
  }, [loadPrestarts]);

  // Re-sync Last Pre-Start / hours when returning to the tab after a mobile/web submission.
  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void loadPrestarts();
      }
    };
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [loadPrestarts]);

  useEffect(() => {
    fetchProjects().then((list) => {
      setProjects(list);
      if (list.length > 0 && !targetProjectId) {
        const def = list.find((p) => p.slug === "project-3") ?? list[0];
        setTargetProjectId(def.id);
      }
    });
  }, [targetProjectId]);

  useEffect(() => {
    if (plant.length > 0 && !selectedPlantId) {
      setSelectedPlantId(plant[0].id);
    }
  }, [plant, selectedPlantId]);

  const schedulesByPlantDate = useMemo(() => {
    const map = new Map<string, PlantServiceSchedule[]>();
    if (!Array.isArray(schedules) || schedules.length === 0) {
      return map;
    }
    for (const schedule of schedules) {
      if (!schedule?.scheduled_date) continue;
      const dateKey = formatDateOnly(schedule.scheduled_date);
      const keys = new Set<string>();
      if (schedule.plant_id) {
        keys.add(`${schedule.plant_id}:${dateKey}`);
      }
      if (schedule.unit_number?.trim()) {
        keys.add(`unit:${schedule.unit_number.trim().toLowerCase()}:${dateKey}`);
      }
      for (const key of keys) {
        const list = map.get(key) ?? [];
        list.push(schedule);
        map.set(key, list);
      }
    }
    return map;
  }, [schedules]);

  const serviceDatesInRange = useMemo(() => {
    const set = new Set<string>();
    if (!Array.isArray(schedules)) return set;
    for (const schedule of schedules) {
      if (schedule?.scheduled_date) {
        set.add(formatDateOnly(schedule.scheduled_date));
      }
    }
    return set;
  }, [schedules]);

  const handleMoveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlantId) return;
    const project = projects.find((p) => p.id === targetProjectId);
    if (!project) return;

    const selectedPlant = plant.find((row) => row.id === selectedPlantId);
    if (!selectedPlant) {
      setActionMessage("Selected plant is not in the master plant list.");
      return;
    }

    setActionLoading(true);
    setActionMessage(null);
    const { error } = await assignPlantToProject({
      plant: selectedPlant,
      projectId: project.id,
      projectName: project.name,
    });
    setActionLoading(false);
    if (error) {
      setActionMessage(error);
      return;
    }
    setActionMessage(`Unit moved to ${project.name}.`);
    onRefresh();
  };

  const handleLogService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlantId || !serviceDate) return;

    setActionLoading(true);
    setActionMessage(null);
    const selectedPlant = plant.find((row) => row.id === selectedPlantId);
    const { error } = await createPlantServiceSchedule(
      buildPlantServiceCreateInput(selectedPlant ?? { id: selectedPlantId }, {
        serviceDate: formatDateOnly(serviceDate),
        serviceType,
        notes: technicianNotes || undefined,
        targetHours:
          selectedPlant?.next_service_hours ?? selectedPlant?.current_hours ?? null,
      })
    );
    setActionLoading(false);
    if (error) {
      setActionMessage(error);
      return;
    }
    setActionMessage("Service / maintenance logged.");
    setTechnicianNotes("");
    await loadSchedules();
    onRefresh();
  };

  const selectedPlant = plant.find((p) => p.id === selectedPlantId);

  const projectFilterSet = useMemo(
    () => expandProjectFilterIds(filterProjectIds, projects),
    [filterProjectIds, projects]
  );

  const visiblePlant = useMemo(
    () =>
      plant.filter((asset) =>
        matchesProjectFilter(resolvePlantAssignedProjectId(asset), projectFilterSet)
      ),
    [plant, projectFilterSet]
  );

  const latestPrestartByPlant = latestPrestartsByPlant;

  const bookedServicesByPlant = useMemo(() => {
    const todayIso = formatDateOnly(new Date());
    return indexBookedServicesByPlant(bookedServices, todayIso);
  }, [bookedServices]);

  const prestartsByPlantDate = useMemo(
    () => groupPrestartsByPlantDate(prestarts),
    [prestarts]
  );

  const patchPrestartInState = useCallback(
    (prestartId: string, patch: PlantPrestart) => {
      setPrestarts((current) =>
        current.map((row) => (row.id === prestartId ? patch : row))
      );
      setLatestPrestartsByPlant((current) => {
        const next = new Map(current);
        for (const [plantId, row] of next.entries()) {
          if (row.id === prestartId) {
            next.set(plantId, patch);
          }
        }
        return next;
      });
    },
    []
  );

  const handleResolveDefect = useCallback(
    async (resolutionNotes: string) => {
      if (!resolveDefectTarget) {
        return { error: "No defect selected." };
      }

      const { plant: targetPlant, prestart } = resolveDefectTarget;
      const { error } = await resolvePlantPrestartDefect({
        plantId: targetPlant.id,
        prestartId: prestart.id,
        resolutionNotes,
      });

      if (error) {
        return { error };
      }

      patchPrestartInState(
        prestart.id,
        applyResolvedPrestartPatch(prestart, resolutionNotes)
      );
      onRefresh();
      void loadPrestarts();
      return { error: null };
    },
    [loadPrestarts, onRefresh, patchPrestartInState, resolveDefectTarget]
  );

  const pinnedExtraColumns = useMemo(
    () => [
      {
        key: "current_hours",
        label: "Current Hours",
        width: 112,
        renderCell: (asset: PlantAsset) => {
          const latest = latestPrestartByPlant.get(asset.id);
          return (
            <span className="font-semibold text-slate-900">
              {formatPrestartHours(
                latest?.current_reading ?? asset.current_hours ?? null
              )}
            </span>
          );
        },
      },
      {
        key: "next_service_due",
        label: "Next Service Due",
        width: 124,
        renderCell: (asset: PlantAsset) => {
          const latest = latestPrestartByPlant.get(asset.id);
          return (
            <span className="font-semibold text-slate-900">
              {formatPrestartHours(
                latest?.next_service_due ?? asset.next_service_hours ?? null
              )}
            </span>
          );
        },
      },
      {
        key: "last_pre_start",
        label: "Last Pre-Start",
        width: 128,
        renderCell: (asset: PlantAsset) => {
          const latest = latestPrestartByPlant.get(asset.id);
          const { dateLabel, relativeLabel } = formatLastPrestartColumnLabel(latest);
          if (!latest) {
            return (
              <span className="text-xs font-medium text-slate-400">{dateLabel}</span>
            );
          }
          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-slate-900">{dateLabel}</span>
              {relativeLabel ? (
                <span
                  className={cn(
                    "w-fit rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    relativeLabel === "Today"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-600"
                  )}
                >
                  {relativeLabel}
                </span>
              ) : null}
            </div>
          );
        },
      },
    ],
    [latestPrestartByPlant]
  );

  const showEmptySchedulesNotice =
    !loading &&
    !schedulesLoading &&
    visiblePlant.length > 0 &&
    schedules.length === 0;

  const renderStickyColumn = useCallback(
    (asset: PlantAsset) => {
      const makeModel = [asset.make, asset.model].filter(Boolean).join(" ").trim();
      const latestForAlerts = showHeaderAlerts
        ? latestPrestartByPlant.get(asset.id)
        : undefined;
      const headerAlerts = showHeaderAlerts
        ? getPlantCalendarHeaderAlerts(asset, latestForAlerts)
        : null;
      const canResolveHeaderDefect =
        showHeaderAlerts &&
        headerAlerts?.defectText &&
        latestForAlerts &&
        !isResolvedPrestartDefect(latestForAlerts);
      const scheduledService = showHeaderAlerts
        ? resolveBookedServiceForPlant(asset, bookedServicesByPlant)
        : undefined;
      const showBookedServiceBadge =
        scheduledService != null &&
        isUpcomingHeaderBookedService(scheduledService, formatDateOnly(new Date()));

      return (
        <>
          <p className="font-semibold text-slate-900">{asset.unit_number}</p>
          <p className="truncate text-xs text-slate-500">
            {makeModel || asset.category}
          </p>
          {canResolveHeaderDefect ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setResolveDefectTarget({ plant: asset, prestart: latestForAlerts });
              }}
              className="mt-1 w-full rounded bg-red-600 px-2 py-0.5 text-left text-xs font-bold text-white shadow hover:bg-red-500"
            >
              DEFECT: {headerAlerts.defectText || "Pre-Start Defect"}
            </button>
          ) : null}
          {headerAlerts?.isServiceDueSoon && headerAlerts.hoursUntilService != null ? (
            <div className="mt-1 rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white shadow">
              SERVICE DUE (
              {headerAlerts.hoursUntilService <= 0
                ? "OVERDUE"
                : `${Math.round(headerAlerts.hoursUntilService)} hrs left`}
              )
            </div>
          ) : null}
          {showBookedServiceBadge && scheduledService ? (
            <div className="mt-1 rounded bg-yellow-400 px-2 py-0.5 text-xs font-bold text-black shadow">
              BOOKED SERVICE: {scheduledService.service_type || "Maintenance"} (
              {formatBookedServiceDate(
                scheduledService.service_date ?? scheduledService.scheduled_date
              )}
              )
            </div>
          ) : null}
        </>
      );
    },
    [
      bookedServicesByPlant,
      latestPrestartByPlant,
      showHeaderAlerts,
    ]
  );

  const renderDayCell = useCallback(
    (asset: PlantAsset, day: CalendarDay) => {
      const dateKey = day.iso;
      const byPlantId = schedulesByPlantDate.get(`${asset.id}:${dateKey}`) ?? [];
      const byUnitNumber = asset.unit_number?.trim()
        ? schedulesByPlantDate.get(
            `unit:${asset.unit_number.trim().toLowerCase()}:${dateKey}`
          ) ?? []
        : [];
      const cellSchedules = [...byPlantId, ...byUnitNumber].filter(
        (schedule, index, list) =>
          list.findIndex((candidate) => candidate.id === schedule.id) === index
      );
      const dayPrestarts = prestartsByPlantDate.get(`${asset.id}:${day.iso}`) ?? [];
      const defectPrestarts = dayPrestarts.filter(isCalendarDefectPrestart);
      const projectAssignment = resolveDayPlantProjectAssignment(
        asset,
        day.iso,
        projectFilterSet
      );
      const hasOverlays = defectPrestarts.length > 0 || cellSchedules.length > 0;

      return (
        <div className="flex h-full min-h-[52px] flex-col">
          {projectAssignment ? (
            <PlantProjectAssignmentCell
              projectName={projectAssignment.projectName}
              compact={hasOverlays}
            />
          ) : null}
          {defectPrestarts.map((prestart) => (
            <PlantDefectBadge
              key={prestart.id}
              prestart={prestart}
              onSelect={setSelectedPrestart}
            />
          ))}
          {cellSchedules.map((schedule) => (
            <PlantServiceBadge key={schedule.id} schedule={schedule} />
          ))}
        </div>
      );
    },
    [prestartsByPlantDate, projectFilterSet, schedulesByPlantDate]
  );

  const renderHeaderDayExtra = useCallback(
    (day: CalendarDay) =>
      serviceDatesInRange.has(day.iso) ? (
        <span className="mt-0.5 inline-block rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-800">
          Service
        </span>
      ) : null,
    [serviceDatesInRange]
  );

  return (
    <div>
      {!hideTitle ? (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-orange-500">{title}</h1>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="min-w-0 flex-1 space-y-2">
          {!schedulesLoading && schedulesUnavailable ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Service schedules are unavailable right now. Project assignments will
              still display below.
            </div>
          ) : null}

          {showEmptySchedulesNotice && !schedulesUnavailable ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
              No service or maintenance events in this date range. Use Log Service /
              Maintenance to add one.
            </div>
          ) : null}

          <HorizontalCalendarGrid
            calendarDays={calendarDays}
            calendarRangeStart={rangeStart}
            calendarRangeEnd={rangeEnd}
            loading={loading || schedulesLoading || prestartsLoading}
            loadingMessage="Loading schedule…"
            items={visiblePlant}
            getItemId={(asset) => asset.id}
            selectedItemId={selectedPlantId}
            onSelectItem={setSelectedPlantId}
            stickyColumnLabel="Plant / Fleet"
            stickyColumnIcon={<Truck className="h-4 w-4" />}
            renderStickyColumn={renderStickyColumn}
            pinnedExtraColumns={pinnedExtraColumns}
            renderDayCell={renderDayCell}
            getRowClassName={(asset) =>
              getFleetStatusLabel(asset, getServiceWarning(asset)) === "Tagged Out"
                ? "bg-red-50/60"
                : undefined
            }
            emptyMessage="No plant matches the selected project filter."
            renderHeaderDayExtra={renderHeaderDayExtra}
            onRangeExtendPast={handleRangeExtendPast}
            onRangeExtendFuture={handleRangeExtendFuture}
            scrollAdjustRef={scrollAdjustRef}
            onFocusedWeekChange={setFocusedWeekStart}
            weekdaysOnly={weekdaysOnly}
            scrollMaxHeightClass={scrollMaxHeightClass}
          />
        </div>

        <aside className="w-full shrink-0 space-y-4 xl:w-80">
          <div className={cn("p-5", cardClass)}>
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-orange-500">
              <Calendar className="h-4 w-4" /> Actions
            </h2>

            {selectedPlant ? (
              <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Selected:{" "}
                <strong className="text-slate-900">{selectedPlant.unit_number}</strong>
                {resolvePlantAssignedProjectName(selectedPlant) !== "Unassigned" ? (
                  <span className="block text-xs text-slate-500">
                    Currently on {resolvePlantAssignedProjectName(selectedPlant)}
                  </span>
                ) : null}
              </p>
            ) : null}

            {actionMessage ? (
              <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {actionMessage}
              </p>
            ) : null}

            <form onSubmit={handleMoveProject} className="mb-6 space-y-3">
              <h3 className="text-xs font-semibold uppercase text-slate-500">
                Move Unit to Project
              </h3>
              <select
                value={selectedPlantId}
                onChange={(e) => setSelectedPlantId(e.target.value)}
                className={inputClass}
              >
                {plant.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.unit_number}
                  </option>
                ))}
              </select>
              <select
                value={targetProjectId}
                onChange={(e) => setTargetProjectId(e.target.value)}
                className={inputClass}
              >
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Visible week: {formatWeekRange(focusedWeekStart)}
              </p>
              <button
                type="submit"
                disabled={actionLoading || !selectedPlantId}
                className="w-full rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
              >
                Move to Project
              </button>
            </form>

            <form
              onSubmit={handleLogService}
              className="space-y-3 border-t border-slate-200 pt-4"
            >
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                <Wrench className="h-3.5 w-3.5" /> Log Service / Maintenance
              </h3>
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                required
                className={inputClass}
              />
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                className={inputClass}
              >
                {SERVICE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <textarea
                value={technicianNotes}
                onChange={(e) => setTechnicianNotes(e.target.value)}
                placeholder="Technician notes (optional)"
                rows={2}
                className={cn(inputClass, "placeholder:text-slate-400")}
              />
              <button
                type="submit"
                disabled={actionLoading || !selectedPlantId}
                className="w-full rounded-lg bg-slate-200 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-300 disabled:opacity-50"
              >
                Save Maintenance Log
              </button>
            </form>
          </div>

          <div className={cn("p-4 text-xs text-slate-500", cardClass)}>
            <p className="mb-2 font-semibold uppercase text-slate-600">Legend</p>
            <ul className="space-y-1.5">
              <li>
                <span className="rounded bg-orange-600 px-1.5 py-0.5 font-bold uppercase text-white">
                  Project
                </span>{" "}
                Assigned project (date cell)
              </li>
              <li>
                <span className="rounded bg-red-600 px-1.5 py-0.5 font-bold uppercase text-white">
                  Alert
                </span>{" "}
                Defect or service due (&le;100 hrs)
              </li>
              <li>
                <span className="rounded bg-yellow-400 px-1.5 py-0.5 font-bold text-black">
                  Booked
                </span>{" "}
                Scheduled maintenance
              </li>
              <li>
                <span className="rounded bg-amber-500 px-1.5 py-0.5 font-bold uppercase text-white">
                  Service
                </span>{" "}
                Scheduled maintenance
              </li>
              <li>
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Tagged
                out row highlight
              </li>
            </ul>
          </div>
        </aside>
      </div>

      {selectedPrestart ? (
        <PlantPrestartDetailModal
          prestart={selectedPrestart}
          plant={plant}
          onClose={() => setSelectedPrestart(null)}
        />
      ) : null}

      {resolveDefectTarget ? (
        <PlantDefectResolveModal
          plant={resolveDefectTarget.plant}
          prestart={resolveDefectTarget.prestart}
          onClose={() => setResolveDefectTarget(null)}
          onConfirm={handleResolveDefect}
        />
      ) : null}
    </div>
  );
}
