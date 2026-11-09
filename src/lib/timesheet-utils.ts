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

export function createEmptyBreakSlot(): TimesheetBreakSlot {
  return {
    id: `break-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    startTime: "",
    endTime: "",
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

/**
 * Coerce break fields that may be checkbox noise ("on"), booleans, minutes, or hours.
 * Returns decimal hours (e.g. 30 minutes → 0.5).
 */
export function parseTimesheetBreakHours(
  breakHoursValue: unknown,
  breakMinutesValue?: unknown
): number {
  const fromMinutes = (raw: unknown): number | null => {
    if (raw == null || raw === "") return null;
    if (typeof raw === "boolean") return null;
    const text = String(raw).trim().toLowerCase();
    if (!text || text === "on" || text === "off" || text === "true" || text === "false") {
      return null;
    }
    const mins = Number(text);
    if (!Number.isFinite(mins) || mins < 0) return null;
    return minutesToHours(mins);
  };

  if (typeof breakHoursValue === "boolean") {
    return fromMinutes(breakMinutesValue) ?? 0;
  }

  if (breakHoursValue != null && breakHoursValue !== "") {
    const text = String(breakHoursValue).trim().toLowerCase();
    if (text && text !== "on" && text !== "off" && text !== "true" && text !== "false") {
      const asNumber = Number(text);
      if (Number.isFinite(asNumber) && asNumber >= 0) {
        // Values like 30 are almost certainly minutes when > 16.
        if (asNumber > 16) return minutesToHours(asNumber);
        return Math.round(asNumber * 100) / 100;
      }
    }
  }

  return fromMinutes(breakMinutesValue) ?? 0;
}

export function calculateDailyTotalsFromSlots(
  activities: TimesheetActivitySlot[],
  breaks: TimesheetBreakSlot[]
): {
  /** Net worked hours after break (Work Total). */
  workHours: number;
  /** Break duration in decimal hours (Break Total). */
  breakHours: number;
  /** Gross elapsed span including break + leave (Daily Total). */
  dailyTotalHours: number;
  leaveHours: number;
  /** Gross work-line span before subtracting break. */
  grossWorkHours: number;
} {
  const grossWorkHours = sumWorkLineHours(activities);
  const leaveHours = sumLeaveLineHours(activities);
  const breakMinutes = breaks.reduce(
    (sum, row) => sum + calculateSlotMinutes(row.startTime, row.endTime),
    0
  );
  const breakHours = minutesToHours(breakMinutes);
  const workHours = Math.max(
    0,
    Math.round((grossWorkHours - breakHours) * 100) / 100
  );
  // Daily total = full elapsed day (work span including break) + leave.
  const dailyTotalHours = Math.max(
    0,
    Math.round((grossWorkHours + leaveHours) * 100) / 100
  );

  return { workHours, breakHours, dailyTotalHours, leaveHours, grossWorkHours };
}

export interface ResolvedTimesheetDisplayTotals {
  startTime: string;
  endTime: string;
  /** Net worked hours after break (Work Total column). */
  workHours: number;
  /** Break duration in decimal hours (Break Total column). */
  breakHours: number;
  /** Gross elapsed including break (Daily Total column). */
  dailyTotalHours: number;
  leaveHours: number;
  /** Gross work-line span before subtracting break. */
  grossWorkHours: number;
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
    // Prefer explicit break_minutes / break_hours when break slots failed to parse
    // (e.g. legacy rows) but still keep slot-derived value when present.
    const breakHours =
      totals.breakHours > 0
        ? totals.breakHours
        : parseTimesheetBreakHours(row.break_hours, row.break_minutes);
    const grossWorkHours = totals.grossWorkHours;
    const workHours = Math.max(
      0,
      Math.round((grossWorkHours - breakHours) * 100) / 100
    );
    const dailyTotalHours = Math.max(
      0,
      Math.round((grossWorkHours + totals.leaveHours) * 100) / 100
    );
    return {
      startTime: activities[0]?.startTime ?? row.start_time,
      endTime: activities[activities.length - 1]?.endTime ?? row.finish_time,
      workHours,
      breakHours,
      dailyTotalHours,
      leaveHours: totals.leaveHours,
      grossWorkHours,
    };
  }

  const workMinutes = calculateSlotMinutes(row.start_time, row.finish_time);
  const breakHours = parseTimesheetBreakHours(row.break_hours, row.break_minutes);
  const grossWorkHours =
    row.work_hours != null && Number.isFinite(Number(row.work_hours))
      ? Math.max(0, Number(row.work_hours) + breakHours)
      : minutesToHours(workMinutes);
  const workHours = Math.max(
    0,
    Math.round((grossWorkHours - breakHours) * 100) / 100
  );
  const dailyTotalHours = Math.max(
    0,
    Math.round(grossWorkHours * 100) / 100
  );

  return {
    startTime: row.start_time,
    endTime: row.finish_time,
    workHours,
    breakHours,
    dailyTotalHours,
    leaveHours: 0,
    grossWorkHours,
  };
}

export function formatTimesheetHoursLabel(hours: number): string {
  const safe = Number(hours);
  if (!Number.isFinite(safe)) return "0hrs";
  if (Number.isInteger(safe)) return `${safe}hrs`;
  return `${safe.toFixed(1)}hrs`;
}

export function localIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Normalize a timesheet work date to local calendar YYYY-MM-DD.
 * Handles date-only strings and UTC/offset ISO timestamps without
 * treating `toISOString().slice(0, 10)` as the local day.
 */
export function toTimesheetDateKey(
  value: string | Date | null | undefined
): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : localIsoDate(value);
  }

  const trimmed = String(value).trim();
  if (!trimmed) return "";

  // Postgres `date` and already-normalized keys.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Date-only prefix on a datetime string — prefer local calendar day when
  // a full timestamp is parseable (avoids UTC-day drift for "today").
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return localIsoDate(parsed);
  }

  const datePrefix = trimmed.split("T")[0]?.split(" ")[0] ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(datePrefix) ? datePrefix : "";
}

/** Sum hours for all timesheet rows whose work_date is today's local date. */
export function sumTodaysTimesheetHours(
  timesheets: Array<{
    work_date?: string | null;
    daily_total_hours?: number | null;
    total_hours?: number | null;
    hours?: number | string | null;
  }>,
  today: string = localIsoDate()
): number {
  const todayKey = toTimesheetDateKey(today) || localIsoDate();
  return timesheets.reduce((sum, row) => {
    if (toTimesheetDateKey(row.work_date) !== todayKey) return sum;
    const hours = Number(
      row.daily_total_hours ?? row.total_hours ?? row.hours ?? 0
    );
    return sum + (Number.isFinite(hours) ? hours : 0);
  }, 0);
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
  const safe = Number(hours);
  if (!Number.isFinite(safe)) return "0h";
  if (Number.isInteger(safe)) return `${safe}h`;
  return `${safe.toFixed(1)}h`;
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
