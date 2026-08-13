import type { WorkerTimesheet, TimesheetStatus } from "./supabase";
import {
  resolveLineItemHours,
  sumLeaveLineHours,
  sumWorkLineHours,
} from "./timesheet-line-items";

export interface TimesheetActivitySlot {
  id: string;
  startTime: string;
  endTime: string;
  label: string;
  category?: import("./timesheet-line-items").TimesheetLineCategory;
  durationMode?: import("./timesheet-line-items").TimesheetDurationMode;
  hours?: number | null;
}

export interface TimesheetBreakSlot {
  id: string;
  startTime: string;
  endTime: string;
}

export function createDefaultActivitySlot(): TimesheetActivitySlot {
  return {
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    startTime: "06:30",
    endTime: "14:30",
    label: "WORKING ON SITE",
    category: "work",
    durationMode: "partial",
    hours: 8,
  };
}

export function createDefaultBreakSlot(): TimesheetBreakSlot {
  return {
    id: `break-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    startTime: "09:30",
    endTime: "10:00",
  };
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

export function calculateSlotMinutes(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  let startM = timeToMinutes(startTime);
  let endM = timeToMinutes(endTime);
  if (endM <= startM) endM += 24 * 60;
  return endM - startM;
}

export function validateBreakSlot(startTime: string, endTime: string): string | null {
  const minutes = calculateSlotMinutes(startTime, endTime);
  if (minutes <= 0) {
    return "Must be greater than 0 minutes";
  }
  return null;
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export const DEFAULT_TIMESHEET_START_TIME = "06:30";
export const DEFAULT_TIMESHEET_END_TIME = "14:30";
export const DEFAULT_TIMESHEET_SEGMENT_HOURS = 4;

export function minutesToTimeString(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function addHoursToTime(time: string, hours: number): string {
  return minutesToTimeString(timeToMinutes(time) + Math.round(hours * 60));
}

export function validateLineItemTimeRange(
  startTime: string,
  endTime: string
): string | null {
  if (!startTime || !endTime) {
    return "Start and finish times are required.";
  }
  if (calculateSlotMinutes(startTime, endTime) <= 0) {
    return "Finish time must be after start time.";
  }
  return null;
}

export function calculateDailyTotalsFromSlots(
  activities: TimesheetActivitySlot[],
  breaks: TimesheetBreakSlot[]
): {
  workHours: number;
  breakHours: number;
  dailyTotalHours: number;
  leaveHours: number;
} {
  const workHours = sumWorkLineHours(activities);
  const leaveHours = sumLeaveLineHours(activities);
  const breakMinutes = breaks.reduce(
    (sum, row) => sum + calculateSlotMinutes(row.startTime, row.endTime),
    0
  );
  const breakHours = minutesToHours(breakMinutes);
  const dailyTotalHours = Math.max(
    0,
    Math.round((workHours - breakHours + leaveHours) * 100) / 100
  );

  return { workHours, breakHours, dailyTotalHours, leaveHours };
}

export interface ResolvedTimesheetDisplayTotals {
  startTime: string;
  endTime: string;
  workHours: number;
  breakHours: number;
  dailyTotalHours: number;
  leaveHours: number;
}

/** Derive start/end and hour totals from activity/break slots or legacy fields. */
export function resolveTimesheetDisplayTotals(
  row: Pick<
    WorkerTimesheet,
    | "start_time"
    | "finish_time"
    | "break_minutes"
    | "work_hours"
    | "break_hours"
    | "daily_total_hours"
    | "total_hours"
    | "activities"
    | "breaks"
  >
): ResolvedTimesheetDisplayTotals {
  const activities = row.activities ?? [];
  const breaks = row.breaks ?? [];

  if (activities.length > 0 || breaks.length > 0) {
    const totals = calculateDailyTotalsFromSlots(activities, breaks);
    return {
      startTime: activities[0]?.startTime ?? row.start_time,
      endTime: activities[activities.length - 1]?.endTime ?? row.finish_time,
      workHours: totals.workHours,
      breakHours: totals.breakHours,
      dailyTotalHours: totals.dailyTotalHours,
      leaveHours: totals.leaveHours,
    };
  }

  const workMinutes = calculateSlotMinutes(row.start_time, row.finish_time);
  const breakMinutes = Number(row.break_minutes ?? 0) || 0;
  const breakHours =
    row.break_hours != null
      ? Number(row.break_hours)
      : minutesToHours(breakMinutes);
  const workHours =
    row.work_hours != null ? Number(row.work_hours) : minutesToHours(workMinutes);
  const dailyTotalHours =
    row.daily_total_hours != null
      ? Number(row.daily_total_hours)
      : row.total_hours != null
        ? Number(row.total_hours)
        : calculateTimesheetHours(row.start_time, row.finish_time, breakMinutes);

  return {
    startTime: row.start_time,
    endTime: row.finish_time,
    workHours,
    breakHours,
    dailyTotalHours,
    leaveHours: 0,
  };
}

export function formatTimesheetHoursLabel(hours: number): string {
  if (Number.isInteger(hours)) return `${hours}hrs`;
  return `${hours.toFixed(1)}hrs`;
}

export function localIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const TIMESHEET_MAX_ADVANCE_DAYS = 30;

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

export function isAdvanceTimesheetDate(
  workDate: string,
  referenceDate: string = localIsoDate()
): boolean {
  return workDate > referenceDate;
}

export function validateTimesheetWorkDate(workDate: string): string | null {
  const today = localIsoDate();
  const maxAdvanceDate = addDaysToIsoDate(today, TIMESHEET_MAX_ADVANCE_DAYS);

  if (workDate > maxAdvanceDate) {
    return `Timesheets can only be submitted up to ${TIMESHEET_MAX_ADVANCE_DAYS} days in advance.`;
  }

  return null;
}

/** Net hours from HH:MM start/finish minus break minutes. */
export function calculateTimesheetHours(
  startTime: string,
  finishTime: string,
  breakMinutes: number
): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [fh, fm] = finishTime.split(":").map(Number);
  let startM = sh * 60 + sm;
  let finishM = fh * 60 + fm;
  if (finishM <= startM) finishM += 24 * 60;
  const net = finishM - startM - breakMinutes;
  return Math.max(0, Math.round((net / 60) * 100) / 100);
}

export function formatTimesheetHours(hours: number): string {
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${hours.toFixed(1)}h`;
}

export function formatTimeDisplay(time: string): string {
  const [h, m] = time.slice(0, 5).split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour % 12 || 12;
  return `${display}:${m}${suffix}`;
}

export function normalizeTimesheetStatus(
  status: string | null | undefined
): TimesheetStatus {
  const normalized = String(status ?? "pending").trim().toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "rejected" || normalized === "declined") return "rejected";
  if (normalized === "draft") return "draft";
  if (
    normalized === "pending" ||
    normalized === "submitted" ||
    normalized === "pending review"
  ) {
    return "pending";
  }
  return "pending";
}

export function isTimesheetApproved(status: string | null | undefined): boolean {
  return normalizeTimesheetStatus(status) === "approved";
}

export function isTimesheetPending(status: string | null | undefined): boolean {
  const normalized = normalizeTimesheetStatus(status);
  return normalized === "pending" || normalized === "draft";
}

export interface WeekTimesheetSummary {
  totalHours: number;
  entryCount: number;
  status: "none" | "pending" | "approved" | "mixed";
  statusLabel: string;
}

export function getWeekTimesheetSummary(
  timesheets: WorkerTimesheet[]
): WeekTimesheetSummary {
  if (timesheets.length === 0) {
    return {
      totalHours: 0,
      entryCount: 0,
      status: "none",
      statusLabel: "No entries",
    };
  }

  const totalHours = timesheets.reduce(
    (sum, row) => sum + Number(row.daily_total_hours ?? row.total_hours),
    0
  );
  const rounded = Math.round(totalHours * 100) / 100;

  if (timesheets.some((t) => isTimesheetPending(t.status))) {
    return {
      totalHours: rounded,
      entryCount: timesheets.length,
      status: "pending",
      statusLabel: "Pending",
    };
  }

  if (timesheets.every((t) => isTimesheetApproved(t.status))) {
    return {
      totalHours: rounded,
      entryCount: timesheets.length,
      status: "approved",
      statusLabel: "Approved",
    };
  }

  return {
    totalHours: rounded,
    entryCount: timesheets.length,
    status: "mixed",
    statusLabel: "Mixed",
  };
}

export function timesheetStatusMeta(status: TimesheetStatus | string): {
  label: string;
  badgeClass: string;
} {
  switch (normalizeTimesheetStatus(status)) {
    case "approved":
      return {
        label: "Approved",
        badgeClass: "bg-emerald-100 text-emerald-800",
      };
    case "rejected":
      return {
        label: "Rejected",
        badgeClass: "bg-red-100 text-red-800",
      };
    case "draft":
      return {
        label: "Draft",
        badgeClass: "bg-slate-100 text-slate-700",
      };
    default:
      return {
        label: "Pending Review",
        badgeClass: "bg-amber-100 text-amber-800",
      };
  }
}

export function weekSummaryStatusClass(
  status: WeekTimesheetSummary["status"]
): string {
  switch (status) {
    case "approved":
      return "bg-emerald-100 text-emerald-800";
    case "pending":
      return "bg-amber-100 text-amber-800";
    case "mixed":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}
