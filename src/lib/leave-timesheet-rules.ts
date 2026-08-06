import { isLeaveTimesheet } from "./calculateTimesheetPay";
import { leaveTypeDisplayBadge, normalizeLeaveTypeLabel } from "./leave-type-calendar";
import { isWeekdayIso } from "./scheduler-utils";
import type { WorkerTimesheet } from "./supabase";

export const LEAVE_TIMESHEET_START = "06:30";
export const LEAVE_TIMESHEET_FINISH = "14:30";
export const LEAVE_TIMESHEET_WEEKDAY_HOURS = 8;

/** Leave types that always generate 0.0-hour pending timesheet rows. */
export function isZeroHourLeaveType(leaveType?: string | null): boolean {
  const normalized = normalizeLeaveTypeLabel(leaveType);
  return normalized === "Sick Leave" || normalized === "Leave without pay";
}

export interface LeaveTimesheetDaySpec {
  totalHours: number;
  workHours: number;
  startTime: string;
  finishTime: string;
  activities: Array<{
    id: string;
    start_time: string;
    end_time: string;
    label: string;
  }>;
}

/** Resolve hours and clock times for one calendar day in an approved leave range. */
export function resolveLeaveTimesheetDaySpec(
  leaveType: string | null | undefined,
  dayIso: string
): LeaveTimesheetDaySpec {
  const label = normalizeLeaveTypeLabel(leaveType);

  if (isZeroHourLeaveType(label)) {
    return buildLeaveDaySpec(label, 0, "00:00", "00:00");
  }

  if (isWeekdayIso(dayIso)) {
    return buildLeaveDaySpec(
      label,
      LEAVE_TIMESHEET_WEEKDAY_HOURS,
      LEAVE_TIMESHEET_START,
      LEAVE_TIMESHEET_FINISH
    );
  }

  return buildLeaveDaySpec(label, 0, "00:00", "00:00");
}

function buildLeaveDaySpec(
  label: string,
  hours: number,
  startTime: string,
  finishTime: string
): LeaveTimesheetDaySpec {
  return {
    totalHours: hours,
    workHours: hours,
    startTime,
    finishTime,
    activities: [
      {
        id: "leave-auto",
        start_time: startTime,
        end_time: finishTime,
        label,
      },
    ],
  };
}

export function extractLeaveTypeFromTimesheet(
  timesheet: WorkerTimesheet
): string | null {
  if (!isLeaveTimesheet(timesheet)) return null;

  const notes = String(timesheet.notes ?? "").trim();
  if (notes) {
    const prefix = notes.split(" - ")[0]?.trim();
    if (prefix) return normalizeLeaveTypeLabel(prefix);
  }

  const activities = timesheet.activities ?? [];
  for (const activity of activities) {
    const label = String(activity.label ?? "").trim();
    if (label && label.toUpperCase() !== "WORKING ON SITE") {
      return normalizeLeaveTypeLabel(label);
    }
  }

  return "Annual Leave";
}

export function formatLeaveTimesheetHoursLabel(hours: number): string {
  const safe = Number.isFinite(hours) ? hours : 0;
  const formatted = Number.isInteger(safe) ? `${safe}.0` : safe.toFixed(1);
  return `${formatted} hrs`;
}

export interface LeaveTimesheetDisplay {
  label: string;
  badgeClass: string;
  leaveType: string;
  hours: number;
}

export function resolveLeaveTimesheetDisplay(
  timesheet: WorkerTimesheet
): LeaveTimesheetDisplay | null {
  const leaveType = extractLeaveTypeFromTimesheet(timesheet);
  if (!leaveType) return null;

  const hours = Number(timesheet.daily_total_hours ?? timesheet.total_hours ?? 0);
  const badge = leaveTypeDisplayBadge(leaveType);

  return {
    leaveType,
    hours: Number.isFinite(hours) ? hours : 0,
    badgeClass: badge.badgeClass,
    label: `${leaveType} (${formatLeaveTimesheetHoursLabel(hours)})`,
  };
}
