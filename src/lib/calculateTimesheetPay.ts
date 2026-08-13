import type { WorkerTimesheet } from "./supabase";
import type { PayRateRule } from "./pay-rates-and-rules";
import {
  isMealAllowanceEligible,
  resolveMealAllowanceThreshold,
  resolveNetWorkedHoursForMealAllowance,
} from "./meal-allowance";
import { isWeekdayIso } from "./scheduler-utils";
import {
  isLeaveLineCategory,
  resolveTimesheetLineItems,
  type TimesheetLineCategory,
} from "./timesheet-line-items";
import { calculateDailyTotalsFromSlots } from "./timesheet-utils";

export interface TimesheetPayLineItem {
  category: TimesheetLineCategory;
  label: string;
  hours: number;
  rate: number;
  amount: number;
}

export interface TimesheetPayBreakdown {
  rule_name: string;
  work_date: string;
  daily_hours: number;
  work_hours: number;
  leave_hours: number;
  is_leave_day: boolean;
  is_mixed_day: boolean;
  is_weekend: boolean;
  base_hours: number;
  base_pay: number;
  overtime_hours: number;
  overtime_pay: number;
  site_allowance_pay: number;
  productivity_allowance_pay: number;
  hsr_allowance_pay: number;
  travel_allowance_pay: number;
  meal_allowance_pay: number;
  total_gross_pay: number;
  line_items: TimesheetPayLineItem[];
}

export interface CalculateTimesheetPayOptions {
  hsrApplicable?: boolean;
  /** When true, uses travel_apprentice_daily when set, otherwise travel_allowance_daily. */
  isApprentice?: boolean;
  travelApplicable?: boolean;
  /** When true, daily travel allowance is excluded from pay calculations. */
  hasCompanyVehicle?: boolean;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isSaturdayIso(dayIso: string): boolean {
  return new Date(`${dayIso}T12:00:00`).getDay() === 6;
}

function isSundayIso(dayIso: string): boolean {
  return new Date(`${dayIso}T12:00:00`).getDay() === 0;
}

/** Detect leave / RDO / PH auto-generated timesheet rows. */
export function isLeaveTimesheet(timesheet: WorkerTimesheet): boolean {
  if (timesheet.leave_request_id) return true;

  const notes = String(timesheet.notes ?? "").toLowerCase();
  if (notes.includes("auto-generated from approved leave request")) return true;

  const leaveMarkers = [
    "rdo",
    "flexi rdo",
    "personal leave",
    "annual leave",
    "leave without pay",
    "public holiday",
    "sick leave",
    "carers leave",
  ];

  return leaveMarkers.some((marker) => notes.includes(marker));
}

function resolveWeekendHourlyRate(
  workDate: string,
  payRule: PayRateRule
): number {
  if (isSaturdayIso(workDate) && payRule.saturday_rate > 0) {
    return payRule.saturday_rate;
  }
  if (isSundayIso(workDate) && payRule.sunday_rate > 0) {
    return payRule.sunday_rate;
  }

  return payRule.base_hourly_rate * payRule.overtime_multiplier;
}

function resolveNetWorkHours(timesheet: WorkerTimesheet): number {
  const activities = timesheet.activities ?? [];
  const breaks = timesheet.breaks ?? [];
  const totals = calculateDailyTotalsFromSlots(activities, breaks);
  return Math.max(0, Math.round((totals.workHours - totals.breakHours) * 100) / 100);
}

function resolveLeaveHours(timesheet: WorkerTimesheet): number {
  const activities = timesheet.activities ?? [];
  const breaks = timesheet.breaks ?? [];
  return calculateDailyTotalsFromSlots(activities, breaks).leaveHours;
}

function resolveDailyHours(timesheet: WorkerTimesheet): number {
  const activities = timesheet.activities ?? [];
  if (activities.length > 0) {
    const breaks = timesheet.breaks ?? [];
    return calculateDailyTotalsFromSlots(activities, breaks).dailyTotalHours;
  }

  const hours = Number(
    timesheet.daily_total_hours ?? timesheet.total_hours ?? 0
  );
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

function calculateWorkPay(
  workDate: string,
  workHours: number,
  payRule: PayRateRule
): {
  baseHours: number;
  basePay: number;
  overtimeHours: number;
  overtimePay: number;
  effectiveRate: number;
} {
  if (workHours <= 0) {
    return {
      baseHours: 0,
      basePay: 0,
      overtimeHours: 0,
      overtimePay: 0,
      effectiveRate: payRule.base_hourly_rate,
    };
  }

  const isWeekend = isSaturdayIso(workDate) || isSundayIso(workDate);

  if (isWeekend) {
    const weekendRate = resolveWeekendHourlyRate(workDate, payRule);
    const overtimePay = roundMoney(workHours * weekendRate);
    return {
      baseHours: 0,
      basePay: 0,
      overtimeHours: workHours,
      overtimePay,
      effectiveRate: weekendRate,
    };
  }

  if (isWeekdayIso(workDate)) {
    const baseThreshold = payRule.overtime_15_threshold_hours;
    const baseHours = Math.min(workHours, baseThreshold);
    const overtimeHours = Math.max(0, workHours - baseThreshold);
    const basePay = roundMoney(baseHours * payRule.base_hourly_rate);
    const overtimePay = roundMoney(
      overtimeHours * payRule.base_hourly_rate * payRule.overtime_multiplier
    );
    const totalPay = basePay + overtimePay;
    const effectiveRate =
      workHours > 0 ? roundMoney(totalPay / workHours) : payRule.base_hourly_rate;

    return {
      baseHours,
      basePay,
      overtimeHours,
      overtimePay,
      effectiveRate,
    };
  }

  const basePay = roundMoney(workHours * payRule.base_hourly_rate);
  return {
    baseHours: workHours,
    basePay,
    overtimeHours: 0,
    overtimePay: 0,
    effectiveRate: payRule.base_hourly_rate,
  };
}

export function calculateTimesheetPay(
  timesheet: WorkerTimesheet,
  payRule: PayRateRule,
  options: CalculateTimesheetPayOptions = {}
): TimesheetPayBreakdown {
  const workDate = timesheet.work_date;
  const activities = timesheet.activities ?? [];
  const hasLineItems = activities.length > 0;
  const workHours = hasLineItems
    ? resolveNetWorkHours(timesheet)
    : isLeaveTimesheet(timesheet)
      ? 0
      : resolveDailyHours(timesheet);
  const leaveHours = hasLineItems
    ? resolveLeaveHours(timesheet)
    : isLeaveTimesheet(timesheet)
      ? resolveDailyHours(timesheet)
      : 0;
  const dailyHours = hasLineItems
    ? resolveDailyHours(timesheet)
    : resolveDailyHours(timesheet);
  const hsrApplicable = options.hsrApplicable ?? false;
  const isApprentice = options.isApprentice ?? false;
  const isWeekend = isSaturdayIso(workDate) || isSundayIso(workDate);
  const isMixedDay = workHours > 0 && leaveHours > 0;
  const isLeaveDay =
    leaveHours > 0 && workHours === 0 && (hasLineItems || isLeaveTimesheet(timesheet));
  const travelApplicable =
    (options.travelApplicable ?? workHours > 0) && !(options.hasCompanyVehicle ?? false);

  const lineItems: TimesheetPayLineItem[] = [];

  if (workHours > 0) {
    const workPay = calculateWorkPay(workDate, workHours, payRule);
    lineItems.push({
      category: "work",
      label: "Work / On Site",
      hours: workHours,
      rate: workPay.effectiveRate,
      amount: roundMoney(workPay.basePay + workPay.overtimePay),
    });
  }

  if (hasLineItems) {
    for (const item of resolveTimesheetLineItems(timesheet)) {
      if (!isLeaveLineCategory(item.category) || item.hours <= 0) continue;
      lineItems.push({
        category: item.category,
        label: item.label,
        hours: item.hours,
        rate: payRule.base_hourly_rate,
        amount: roundMoney(item.hours * payRule.base_hourly_rate),
      });
    }
  } else if (isLeaveDay && leaveHours > 0) {
    lineItems.push({
      category: "annual_leave",
      label: "Leave",
      hours: leaveHours,
      rate: payRule.base_hourly_rate,
      amount: roundMoney(leaveHours * payRule.base_hourly_rate),
    });
  }

  const workPay = calculateWorkPay(workDate, workHours, payRule);
  const leavePay = lineItems
    .filter((item) => isLeaveLineCategory(item.category))
    .reduce((sum, item) => sum + item.amount, 0);

  const siteAllowancePay =
    workHours > 0
      ? roundMoney(workHours * payRule.site_allowance_hourly)
      : 0;
  const productivityAllowancePay =
    workHours > 0
      ? roundMoney(workHours * payRule.productivity_allowance_hourly)
      : 0;
  const hsrAllowancePay =
    hsrApplicable && workHours > 0
      ? roundMoney(workHours * payRule.hsr_allowance_hourly)
      : 0;

  const travelDailyRate =
    isApprentice && payRule.travel_apprentice_daily > 0
      ? payRule.travel_apprentice_daily
      : payRule.travel_allowance_daily > 0
        ? payRule.travel_allowance_daily
        : payRule.daily_allowance;

  const travelAllowancePay =
    travelApplicable && workHours > 0
      ? roundMoney(travelDailyRate)
      : 0;

  const mealThreshold = resolveMealAllowanceThreshold(payRule.meal_allowance_threshold);
  const netWorkedHoursForMeal = resolveNetWorkedHoursForMealAllowance(timesheet);
  const mealAllowancePay =
    isMealAllowanceEligible(netWorkedHoursForMeal, mealThreshold)
      ? roundMoney(payRule.meal_allowance_daily)
      : 0;

  const totalGrossPay = roundMoney(
    workPay.basePay +
      workPay.overtimePay +
      leavePay +
      siteAllowancePay +
      productivityAllowancePay +
      hsrAllowancePay +
      travelAllowancePay +
      mealAllowancePay
  );

  return {
    rule_name: payRule.rule_name,
    work_date: workDate,
    daily_hours: dailyHours,
    work_hours: workHours,
    leave_hours: leaveHours,
    is_leave_day: isLeaveDay,
    is_mixed_day: isMixedDay,
    is_weekend: isWeekend,
    base_hours: workPay.baseHours,
    base_pay: workPay.basePay,
    overtime_hours: workPay.overtimeHours,
    overtime_pay: workPay.overtimePay,
    site_allowance_pay: siteAllowancePay,
    productivity_allowance_pay: productivityAllowancePay,
    hsr_allowance_pay: hsrAllowancePay,
    travel_allowance_pay: travelAllowancePay,
    meal_allowance_pay: mealAllowancePay,
    total_gross_pay: totalGrossPay,
    line_items: lineItems,
  };
}

export function formatPayCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(value);
}
