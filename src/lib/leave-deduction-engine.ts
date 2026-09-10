import type { Worker } from "./supabase";
import {
  calendarDayAppliesToWorker,
  type CompanyCalendarDay,
} from "./company-calendar-days";
import { normalizeLeaveTypeLabel } from "./leave-type-calendar";
import { enumerateDateRange, formatDateOnly, isWeekendIso } from "./scheduler-utils";

export type LeaveDayClassification =
  | "weekend"
  | "public_holiday"
  | "rdo"
  | "chargeable";

export interface ClassifiedLeaveDay {
  date: string;
  classification: LeaveDayClassification;
  title?: string;
  leaveType?: string;
}

export interface LeaveDeductionBreakdown {
  startDate: string;
  endDate: string;
  leaveType: string;
  calendarDays: number;
  weekendDays: number;
  publicHolidayDays: number;
  rdoDays: number;
  chargeableDays: number;
  effectiveDaysDeducted: number;
  hoursPerDay: number;
  effectiveHoursDeducted: number;
  excludedDays: number;
  days: ClassifiedLeaveDay[];
}

const DEFAULT_LEAVE_HOURS_PER_DAY = 8;

export function resolveLeaveHoursPerDay(options?: {
  leaveFlatHours?: number | null;
  conditionName?: string | null;
}): number {
  const fromRate = Number(options?.leaveFlatHours);
  if (Number.isFinite(fromRate) && fromRate > 0) {
    return fromRate;
  }

  const match = String(options?.conditionName ?? "").match(
    /(\d+(?:\.\d+)?)\s*hours?/i
  );
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return DEFAULT_LEAVE_HOURS_PER_DAY;
}

export function isAnnualLeaveType(leaveType?: string | null): boolean {
  const normalized = normalizeLeaveTypeLabel(leaveType);
  return normalized === "Annual Leave" || normalized === "Leave";
}

function matchingCalendarDay(
  date: string,
  dayType: CompanyCalendarDay["day_type"],
  calendarDays: CompanyCalendarDay[],
  worker?: Pick<Worker, "state" | "trade" | "worker_type" | "employment_type"> | null
): CompanyCalendarDay | undefined {
  return calendarDays.find((day) => {
    if (day.date !== date || day.day_type !== dayType) return false;
    if (!worker) return true;
    return calendarDayAppliesToWorker(day, worker);
  });
}

export function classifyLeavePeriod(input: {
  startDate: string;
  endDate: string;
  leaveType?: string | null;
  calendarDays?: CompanyCalendarDay[];
  worker?: Pick<Worker, "state" | "trade" | "worker_type" | "employment_type"> | null;
  hoursPerDay?: number;
}): LeaveDeductionBreakdown {
  const startDate = formatDateOnly(input.startDate);
  const endDate = formatDateOnly(input.endDate);
  const leaveType = normalizeLeaveTypeLabel(input.leaveType);
  const dates = enumerateDateRange(startDate, endDate);
  const calendarDays = input.calendarDays ?? [];
  const hoursPerDay = resolveLeaveHoursPerDay({
    leaveFlatHours: input.hoursPerDay,
  });

  const days: ClassifiedLeaveDay[] = dates.map((date) => {
    if (isWeekendIso(date)) {
      return { date, classification: "weekend", title: "Weekend" };
    }

    const publicHoliday = matchingCalendarDay(
      date,
      "public_holiday",
      calendarDays,
      input.worker
    );
    if (publicHoliday) {
      return {
        date,
        classification: "public_holiday",
        title: publicHoliday.title,
        leaveType: "Public Holiday",
      };
    }

    const rdo = matchingCalendarDay(date, "rdo", calendarDays, input.worker);
    if (rdo) {
      return {
        date,
        classification: "rdo",
        title: rdo.title,
        leaveType: "RDO",
      };
    }

    return {
      date,
      classification: "chargeable",
      title: leaveType,
      leaveType,
    };
  });

  const weekendDays = days.filter((day) => day.classification === "weekend").length;
  const publicHolidayDays = days.filter(
    (day) => day.classification === "public_holiday"
  ).length;
  const rdoDays = days.filter((day) => day.classification === "rdo").length;
  const chargeableDays = days.filter((day) => day.classification === "chargeable").length;

  return {
    startDate,
    endDate,
    leaveType,
    calendarDays: dates.length,
    weekendDays,
    publicHolidayDays,
    rdoDays,
    chargeableDays,
    effectiveDaysDeducted: chargeableDays,
    hoursPerDay,
    effectiveHoursDeducted: Number((chargeableDays * hoursPerDay).toFixed(2)),
    excludedDays: weekendDays + publicHolidayDays + rdoDays,
    days,
  };
}

export function formatLeaveExclusionSummary(
  breakdown: LeaveDeductionBreakdown
): string {
  const parts: string[] = [];
  if (breakdown.weekendDays > 0) {
    parts.push(
      `${breakdown.weekendDays} weekend${breakdown.weekendDays === 1 ? "" : "s"}`
    );
  }
  if (breakdown.publicHolidayDays > 0) {
    parts.push(
      `${breakdown.publicHolidayDays} Public Holiday${
        breakdown.publicHolidayDays === 1 ? "" : "s"
      }`
    );
  }
  if (breakdown.rdoDays > 0) {
    parts.push(`${breakdown.rdoDays} RDO${breakdown.rdoDays === 1 ? "" : "s"}`);
  }
  return parts.join(", ");
}

export function formatLeaveDeductionBreakdown(
  breakdown: LeaveDeductionBreakdown
): {
  totalPeriod: string;
  chargeable: string;
  excluded: string;
} {
  const exclusionDetail = formatLeaveExclusionSummary(breakdown);
  return {
    totalPeriod: `Total period: ${breakdown.calendarDays} calendar day${
      breakdown.calendarDays === 1 ? "" : "s"
    }`,
    chargeable: `Chargeable ${breakdown.leaveType}: ${breakdown.effectiveDaysDeducted} day${
      breakdown.effectiveDaysDeducted === 1 ? "" : "s"
    }`,
    excluded:
      breakdown.excludedDays === 0
        ? "Excluded: 0 non-working days"
        : `Excluded: ${breakdown.excludedDays} non-working day${
            breakdown.excludedDays === 1 ? "" : "s"
          }${exclusionDetail ? ` (${exclusionDetail})` : ""}`,
  };
}

export function serializeLeaveBreakdown(
  breakdown: LeaveDeductionBreakdown
): Record<string, unknown> {
  return {
    startDate: breakdown.startDate,
    endDate: breakdown.endDate,
    leaveType: breakdown.leaveType,
    calendarDays: breakdown.calendarDays,
    weekendDays: breakdown.weekendDays,
    publicHolidayDays: breakdown.publicHolidayDays,
    rdoDays: breakdown.rdoDays,
    chargeableDays: breakdown.chargeableDays,
    effectiveDaysDeducted: breakdown.effectiveDaysDeducted,
    hoursPerDay: breakdown.hoursPerDay,
    effectiveHoursDeducted: breakdown.effectiveHoursDeducted,
    excludedDays: breakdown.excludedDays,
    days: breakdown.days,
  };
}

export function parseStoredLeaveBreakdown(
  value: unknown
): LeaveDeductionBreakdown | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!row.startDate || !row.endDate) return null;
  return classifyLeavePeriod({
    startDate: String(row.startDate),
    endDate: String(row.endDate),
    leaveType: String(row.leaveType ?? "Annual Leave"),
    hoursPerDay: Number(row.hoursPerDay) || undefined,
  });
}
