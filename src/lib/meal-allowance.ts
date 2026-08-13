import type { WorkerTimesheet } from "./supabase";
import { resolveTimesheetDisplayTotals } from "./timesheet-utils";

/** Meal allowance applies when net worked hours (excluding unpaid breaks) reach this threshold. */
export const MEAL_ALLOWANCE_HOURS_THRESHOLD = 10;

export const PAYROLL_MEAL_ALLOWANCE_CATEGORY = "Meal Allowance NSW 2025";

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Net paid work hours for allowance triggers — work duration minus unpaid breaks. */
export function resolveNetWorkedHoursForMealAllowance(
  timesheet: Pick<
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
): number {
  const totals = resolveTimesheetDisplayTotals(timesheet);
  return Math.max(0, roundHours(totals.workHours - totals.breakHours));
}

export function resolveMealAllowanceThreshold(
  configuredThreshold?: number | null
): number {
  if (configuredThreshold == null || configuredThreshold <= 0) {
    return MEAL_ALLOWANCE_HOURS_THRESHOLD;
  }
  return configuredThreshold;
}

export function isMealAllowanceEligible(
  netWorkedHours: number,
  threshold: number = MEAL_ALLOWANCE_HOURS_THRESHOLD
): boolean {
  return netWorkedHours > 0 && netWorkedHours >= threshold;
}
