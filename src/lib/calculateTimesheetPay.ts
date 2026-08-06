import type { WorkerTimesheet } from "./supabase";
import type { PayRateRule } from "./pay-rates-and-rules";
import { isWeekdayIso } from "./scheduler-utils";

export interface TimesheetPayBreakdown {
  rule_name: string;
  work_date: string;
  daily_hours: number;
  is_leave_day: boolean;
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
}

export interface CalculateTimesheetPayOptions {
  hsrApplicable?: boolean;
  /** When true, uses travel_allowance_daily (Apprentice Travel variant uses same flat daily rate). */
  travelApplicable?: boolean;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveDailyHours(timesheet: WorkerTimesheet): number {
  const hours = Number(
    timesheet.daily_total_hours ?? timesheet.total_hours ?? 0
  );
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
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

export function calculateTimesheetPay(
  timesheet: WorkerTimesheet,
  payRule: PayRateRule,
  options: CalculateTimesheetPayOptions = {}
): TimesheetPayBreakdown {
  const workDate = timesheet.work_date;
  const dailyHours = resolveDailyHours(timesheet);
  const hsrApplicable = options.hsrApplicable ?? false;
  const travelApplicable = options.travelApplicable ?? dailyHours > 0;
  const isLeaveDay = isLeaveTimesheet(timesheet);
  const isWeekend = isSaturdayIso(workDate) || isSundayIso(workDate);

  if (isLeaveDay) {
    const baseHours = dailyHours;
    const basePay = roundMoney(baseHours * payRule.base_hourly_rate);

    return {
      rule_name: payRule.rule_name,
      work_date: workDate,
      daily_hours: dailyHours,
      is_leave_day: true,
      is_weekend: isWeekend,
      base_hours: baseHours,
      base_pay: basePay,
      overtime_hours: 0,
      overtime_pay: 0,
      site_allowance_pay: 0,
      productivity_allowance_pay: 0,
      hsr_allowance_pay: 0,
      travel_allowance_pay: 0,
      meal_allowance_pay: 0,
      total_gross_pay: basePay,
    };
  }

  let baseHours = 0;
  let overtimeHours = 0;
  let basePay = 0;
  let overtimePay = 0;

  if (isWeekend) {
    overtimeHours = dailyHours;
    const weekendRate = resolveWeekendHourlyRate(workDate, payRule);
    overtimePay = roundMoney(overtimeHours * weekendRate);
  } else if (isWeekdayIso(workDate)) {
    const baseThreshold = payRule.overtime_15_threshold_hours;
    baseHours = Math.min(dailyHours, baseThreshold);
    overtimeHours = Math.max(0, dailyHours - baseThreshold);
    basePay = roundMoney(baseHours * payRule.base_hourly_rate);
    overtimePay = roundMoney(
      overtimeHours * payRule.base_hourly_rate * payRule.overtime_multiplier
    );
  } else {
    baseHours = dailyHours;
    basePay = roundMoney(baseHours * payRule.base_hourly_rate);
  }

  const siteAllowancePay = roundMoney(
    dailyHours * payRule.site_allowance_hourly
  );
  const productivityAllowancePay = roundMoney(
    dailyHours * payRule.productivity_allowance_hourly
  );
  const hsrAllowancePay = hsrApplicable
    ? roundMoney(dailyHours * payRule.hsr_allowance_hourly)
    : 0;

  const travelAllowancePay =
    travelApplicable && dailyHours > 0
      ? roundMoney(
          payRule.travel_allowance_daily > 0
            ? payRule.travel_allowance_daily
            : payRule.daily_allowance
        )
      : 0;

  const mealThreshold = payRule.meal_allowance_threshold;
  const mealAllowancePay =
    dailyHours >= mealThreshold
      ? roundMoney(payRule.meal_allowance_daily)
      : 0;

  const totalGrossPay = roundMoney(
    basePay +
      overtimePay +
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
    is_leave_day: false,
    is_weekend: isWeekend,
    base_hours: baseHours,
    base_pay: basePay,
    overtime_hours: overtimeHours,
    overtime_pay: overtimePay,
    site_allowance_pay: siteAllowancePay,
    productivity_allowance_pay: productivityAllowancePay,
    hsr_allowance_pay: hsrAllowancePay,
    travel_allowance_pay: travelAllowancePay,
    meal_allowance_pay: mealAllowancePay,
    total_gross_pay: totalGrossPay,
  };
}

export function formatPayCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(value);
}
