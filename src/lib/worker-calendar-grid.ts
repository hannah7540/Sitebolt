import type { Worker, WorkerScheduleEntry } from "./supabase";
import { getWorkerAssignedProjectIds } from "./supabase";
import type { WorkerCalendarEvent } from "./worker-calendar-events";
import type { DbProject } from "./project-resolver";
import { getProjectDisplayName } from "./project-resolver";
import { eventOnDay, formatDateOnly, isWeekdayIso } from "./scheduler-utils";
import { matchesProjectFilter } from "./project-filter-utils";
import { resolveLeaveCalendarPresentation } from "./leave-type-calendar";

export type WorkerProjectMap = Map<string, string[]>;

/** Merge worker row fields with project_worker_assignments junction rows. */
export function getWorkerCalendarProjectIds(
  worker: Worker,
  workerProjectMap?: WorkerProjectMap
): string[] {
  const ids = new Set(getWorkerAssignedProjectIds(worker));

  const legacyProjectId = worker.project_id?.trim() || worker.assigned_project_id?.trim();
  if (legacyProjectId) {
    ids.add(legacyProjectId);
  }

  for (const projectId of workerProjectMap?.get(worker.id) ?? []) {
    if (projectId?.trim()) ids.add(projectId.trim());
  }

  return [...ids];
}

export interface WorkerProjectAssignment {
  projectId: string;
  projectName: string;
  source: "schedule" | "default";
}

function scheduleOnDay(entry: WorkerScheduleEntry, dayIso: string): boolean {
  return eventOnDay(entry.start_date, entry.end_date, dayIso);
}

export function shouldShowWeekendProjectAssignment(
  dayIso: string,
  entry: WorkerScheduleEntry,
  weekDays: { iso: string }[]
): boolean {
  if (!scheduleOnDay(entry, dayIso)) return false;
  if (isWeekdayIso(dayIso)) return true;

  const monday = weekDays[0]?.iso;
  const friday = weekDays[4]?.iso;
  if (!monday || !friday) return true;

  const coversStandardWeek =
    formatDateOnly(entry.start_date) <= monday &&
    formatDateOnly(entry.end_date) >= friday;

  return !coversStandardWeek;
}

/** Active project from worker assignments (row + junction table). */
export function resolveWorkerDefaultProject(
  worker: Worker,
  projects: DbProject[],
  projectFilterSet: Set<string>,
  workerProjectMap?: WorkerProjectMap
): WorkerProjectAssignment | null {
  const assignedIds = getWorkerCalendarProjectIds(worker, workerProjectMap);
  if (assignedIds.length === 0) return null;

  const projectId =
    assignedIds.find((id) => matchesProjectFilter(id, projectFilterSet)) ??
    assignedIds[0];

  if (!projectId || !matchesProjectFilter(projectId, projectFilterSet)) {
    return null;
  }

  const projectName =
    worker.assigned_project_name?.trim() ||
    getProjectDisplayName(projectId, projects) ||
    projects.find((project) => project.id === projectId)?.name ||
    "Project";

  return { projectId, projectName, source: "default" };
}

export function resolveScheduleProjectAssignment(
  schedules: WorkerScheduleEntry[],
  dayIso: string,
  projectFilterSet: Set<string>,
  weekDays: { iso: string }[]
): WorkerProjectAssignment | null {
  const entry = schedules.find(
    (schedule) =>
      schedule.schedule_kind !== "leave" &&
      scheduleOnDay(schedule, dayIso) &&
      schedule.project_id &&
      matchesProjectFilter(schedule.project_id, projectFilterSet) &&
      shouldShowWeekendProjectAssignment(dayIso, schedule, weekDays)
  );

  if (!entry?.project_id) return null;

  return {
    projectId: entry.project_id,
    projectName: entry.project_name?.trim() || "Project",
    source: "schedule",
  };
}

/**
 * Resolve the project block for a day cell.
 * Schedule rows take precedence over the worker's default assigned project.
 */
export function resolveDayProjectAssignment(
  worker: Worker,
  schedules: WorkerScheduleEntry[],
  dayIso: string,
  projects: DbProject[],
  projectFilterSet: Set<string>,
  weekDays: { iso: string }[],
  workerProjectMap?: WorkerProjectMap
): WorkerProjectAssignment | null {
  const fromSchedule = resolveScheduleProjectAssignment(
    schedules,
    dayIso,
    projectFilterSet,
    weekDays
  );
  if (fromSchedule) return fromSchedule;

  if (!isWeekdayIso(dayIso)) return null;

  return resolveWorkerDefaultProject(worker, projects, projectFilterSet, workerProjectMap);
}

export function findActiveCalendarEvent(
  calendarEvents: WorkerCalendarEvent[],
  workerId: string,
  cellDateStr: string
): WorkerCalendarEvent | undefined {
  return findActiveCalendarEvents(calendarEvents, workerId, cellDateStr)[0];
}

export function findActiveCalendarEvents(
  calendarEvents: WorkerCalendarEvent[],
  workerId: string,
  cellDateStr: string
): WorkerCalendarEvent[] {
  const cellDate = formatDateOnly(cellDateStr);
  if (!cellDate) return [];

  return calendarEvents.filter((event) => {
    const startDateStr = formatDateOnly(event.start_date);
    const endDateStr = formatDateOnly(event.end_date);
    if (!startDateStr || !endDateStr) return false;

    return (
      String(event.worker_id) === String(workerId) &&
      cellDate >= startDateStr &&
      cellDate <= endDateStr
    );
  });
}

/** @deprecated Use findActiveCalendarEvents */
export function findMatchedCalendarEvent(
  calendarEvents: WorkerCalendarEvent[],
  workerId: string,
  dateStr: string
): WorkerCalendarEvent | undefined {
  return findActiveCalendarEvent(calendarEvents, workerId, dateStr);
}

/** @deprecated Use findActiveCalendarEvents */
export function getDayCalendarEvents(
  events: WorkerCalendarEvent[],
  workerId: string,
  cellDateStr: string
): WorkerCalendarEvent[] {
  return findActiveCalendarEvents(events, workerId, cellDateStr);
}

export function workerVisibleInCalendarFilter(input: {
  worker: Worker;
  schedules: WorkerScheduleEntry[];
  events: WorkerCalendarEvent[];
  weekDays: { iso: string }[];
  projectFilterSet: Set<string>;
  workerProjectMap?: WorkerProjectMap;
}): boolean {
  const { worker, schedules, events, weekDays, projectFilterSet, workerProjectMap } =
    input;

  if (projectFilterSet.size === 0) return true;

  const assignedIds = getWorkerCalendarProjectIds(worker, workerProjectMap);
  if (assignedIds.some((id) => matchesProjectFilter(id, projectFilterSet))) {
    return true;
  }

  const hasSchedule = schedules.some(
    (entry) =>
      weekDays.some((day) => scheduleOnDay(entry, day.iso)) &&
      matchesProjectFilter(entry.project_id, projectFilterSet)
  );

  if (hasSchedule) return true;

  return events.some((event) =>
    weekDays.some((day) => eventOnDay(event.start_date, event.end_date, day.iso))
  );
}

export function scheduleLeaveOnDay(
  schedules: WorkerScheduleEntry[],
  dayIso: string,
  projectFilterSet: Set<string>
): WorkerScheduleEntry | undefined {
  return schedules.find(
    (entry) =>
      entry.schedule_kind === "leave" &&
      scheduleOnDay(entry, dayIso) &&
      matchesProjectFilter(entry.project_id, projectFilterSet)
  );
}

export function scheduleLeaveToCalendarEvent(
  entry: WorkerScheduleEntry,
  worker: Worker
): WorkerCalendarEvent {
  const presentation = resolveLeaveCalendarPresentation({
    leaveType: entry.role_on_site,
    status: "approved",
  });

  return {
    id: entry.id,
    worker_id: worker.id,
    worker_name: worker.full_name,
    project_id: entry.project_id,
    project_name: entry.project_name,
    event_type: presentation.event_type,
    start_date: entry.start_date,
    end_date: entry.end_date,
    is_full_day: true,
    start_time: null,
    end_time: null,
    notes: null,
    trade: null,
    display_code: presentation.display_code,
    bg_color: presentation.bg_color,
    text_color: presentation.text_color,
    leave_kind: presentation.leave_kind,
    leave_status: presentation.leave_status,
    leave_request_id: entry.leave_request_id ?? null,
  };
}
