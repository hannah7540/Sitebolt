import { PUBLIC_HOLIDAYS_2026 } from "@/lib/company-calendar-2026";
import { isWeekdayIso } from "@/lib/scheduler-utils";
import { normalizeWorkerStateRegion } from "@/lib/worker-state-region";

/** Exact MYOB payroll category labels for WA exports. */
export const WA_MYOB_CATEGORIES = {
  baseHourly: "Base Hourly",
  rdoAccrual: "RDO Accrual",
  overtime: "Overtime 1.5",
  leadingHand: "Leading Hand Allowance",
  rdoTaken: "RDO Taken",
  annualLeavePay: "Annual Leave Pay",
  publicHoliday: "Public Holiday",
  leaveWithoutPay: "Leave without pay",
  personalLeavePay: "Personal Leave Pay",
  annualLeaveLoading: "Annual Leave Loading",
} as const;

export const WA_ORDINARY_HOURS = 7.6;
export const WA_RDO_ACCRUAL_HOURS = 0.4;
export const WA_OVERTIME_THRESHOLD_HOURS = 8;
export const WA_LEAVE_DAY_HOURS = 7.6;
export const WA_ANNUAL_LEAVE_LOADING_UNITS = 17.5;

export const WA_BREAK_REQUIRED_MESSAGE =
  "A break must be recorded for WA timesheets.";

export function isWaWorkerState(state: string | null | undefined): boolean {
  return normalizeWorkerStateRegion(state) === "WA";
}

export function isWaPayRuleName(name: string | null | undefined): boolean {
  const normalized = String(name ?? "").trim().toUpperCase();
  if (!normalized) return false;
  return (
    normalized.startsWith("WA") ||
    /(^|[^A-Z])WA([^A-Z]|$)/.test(normalized) ||
    normalized.includes("WESTERN AUSTRALIA")
  );
}

export function isWaTimesheetJurisdiction(input: {
  workerState?: string | null;
  payRuleName?: string | null;
}): boolean {
  return isWaWorkerState(input.workerState) || isWaPayRuleName(input.payRuleName);
}

export function isWaPublicHolidayDate(isoDate: string): boolean {
  const day = isoDate.slice(0, 10);
  return PUBLIC_HOLIDAYS_2026.some(
    (row) =>
      row.date === day &&
      row.day_type === "public_holiday" &&
      row.state === "WA"
  );
}

export function isWaWeekendOrHoliday(isoDate: string): boolean {
  return !isWeekdayIso(isoDate) || isWaPublicHolidayDate(isoDate);
}

export function isLeadingHandTagName(name: string | null | undefined): boolean {
  return /leading\s*hand/i.test(String(name ?? "").trim());
}

export function isLeadingHandWorker(input: {
  worker_is_leading_hand?: boolean;
  worker_tags?: string[] | null;
  worker_trade?: string | null;
}): boolean {
  if (input.worker_is_leading_hand) return true;
  if ((input.worker_tags ?? []).some((tag) => isLeadingHandTagName(tag))) {
    return true;
  }
  return isLeadingHandTagName(input.worker_trade);
}

export function roundWaUnits(value: number): number {
  return Math.round(value * 10) / 10;
}

export type WaWorkHourSplit = {
  baseHourly: number;
  rdoAccrual: number;
  overtime15: number;
};

/**
 * Net worked hours after break: first 7.6 → Base Hourly, next 0.4 → RDO Accrual,
 * anything after 8.0 → Overtime 1.5. Weekend/PH: all hours Overtime 1.5.
 */
export function calculateWaWorkHours(
  totalHours: number,
  weekendOrHoliday: boolean
): WaWorkHourSplit {
  const hours = Number.isFinite(totalHours) ? Math.max(0, totalHours) : 0;
  if (hours <= 0) {
    return { baseHourly: 0, rdoAccrual: 0, overtime15: 0 };
  }

  if (weekendOrHoliday) {
    return {
      baseHourly: 0,
      rdoAccrual: 0,
      overtime15: roundWaUnits(hours),
    };
  }

  const baseHourly = roundWaUnits(Math.min(hours, WA_ORDINARY_HOURS));
  const rdoAccrual =
    hours >= WA_OVERTIME_THRESHOLD_HOURS
      ? WA_RDO_ACCRUAL_HOURS
      : roundWaUnits(Math.max(0, hours - baseHourly));
  const overtime15 = roundWaUnits(
    Math.max(0, hours - WA_OVERTIME_THRESHOLD_HOURS)
  );

  return { baseHourly, rdoAccrual, overtime15 };
}

export function capWaLeaveHours(hours: number): number {
  const safe = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  return roundWaUnits(Math.min(safe, WA_LEAVE_DAY_HOURS));
}

export function mapWaLeaveTypeToPayrollCategory(leaveType: string): string {
  const normalized = leaveType.trim().toLowerCase();
  if (normalized.includes("personal") || normalized.includes("sick") || normalized.includes("carer")) {
    return WA_MYOB_CATEGORIES.personalLeavePay;
  }
  if (normalized.includes("annual")) {
    return WA_MYOB_CATEGORIES.annualLeavePay;
  }
  if (normalized.includes("public")) {
    return WA_MYOB_CATEGORIES.publicHoliday;
  }
  if (normalized.includes("without pay") || normalized.includes("unpaid") || normalized === "lwop") {
    return WA_MYOB_CATEGORIES.leaveWithoutPay;
  }
  if (normalized.includes("rdo")) {
    return WA_MYOB_CATEGORIES.rdoTaken;
  }
  return WA_MYOB_CATEGORIES.annualLeavePay;
}
