import { localIsoDate } from "./timesheet-utils";

/** Pay weeks run Wednesday 00:00 through Tuesday 23:59 (local). */
export function getPayWeekStart(date: Date = new Date()): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const daysSinceWednesday = (day + 7 - 3) % 7;
  start.setDate(start.getDate() - daysSinceWednesday);
  return start;
}

export function getPayWeekEnd(start: Date): Date {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function getPayWeekRange(date: Date = new Date()): {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
} {
  const start = getPayWeekStart(date);
  const end = getPayWeekEnd(start);
  return {
    start,
    end,
    startIso: localIsoDate(start),
    endIso: localIsoDate(end),
  };
}

const PAY_WEEK_LABEL: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
};

export function formatPayWeekRange(start: Date, end?: Date): string {
  const endDate = end ?? getPayWeekEnd(start);
  const startLabel = start.toLocaleDateString("en-AU", PAY_WEEK_LABEL);
  const endLabel = endDate.toLocaleDateString("en-AU", {
    ...PAY_WEEK_LABEL,
    year: "numeric",
  });
  return `${startLabel} - ${endLabel}`;
}

export interface PayWeekOption {
  startIso: string;
  endIso: string;
  label: string;
}

export interface ListPayWeekOptionsConfig {
  pastCount?: number;
  futureCount?: number;
  anchor?: Date;
}

const DEFAULT_PAST_PAY_WEEKS = 26;
const DEFAULT_FUTURE_PAY_WEEKS = 26;

function buildPayWeekOption(start: Date): PayWeekOption {
  const end = getPayWeekEnd(start);
  return {
    startIso: localIsoDate(start),
    endIso: localIsoDate(end),
    label: formatPayWeekRange(start, end),
  };
}

/** Resolve a pay-week option from any ISO date within or near that week. */
export function resolvePayWeekOption(startIso: string): PayWeekOption {
  const [year, month, day] = startIso.split("-").map(Number);
  const start = getPayWeekStart(new Date(year, month - 1, day));
  return buildPayWeekOption(start);
}

/** Shift a pay-week start ISO by whole weeks (negative = past, positive = future). */
export function shiftPayWeekStart(startIso: string, weekDelta: number): string {
  const [year, month, day] = startIso.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  start.setDate(start.getDate() + weekDelta * 7);
  return localIsoDate(start);
}

export function listPayWeekOptions(
  countOrConfig: number | ListPayWeekOptionsConfig = DEFAULT_PAST_PAY_WEEKS,
  anchor: Date = new Date()
): PayWeekOption[] {
  const config: ListPayWeekOptionsConfig =
    typeof countOrConfig === "number"
      ? { pastCount: countOrConfig, futureCount: 0, anchor }
      : countOrConfig;

  const pastCount = config.pastCount ?? DEFAULT_PAST_PAY_WEEKS;
  const futureCount = config.futureCount ?? DEFAULT_FUTURE_PAY_WEEKS;
  const anchorDate = config.anchor ?? anchor;
  const currentStart = getPayWeekStart(anchorDate);
  const optionByStart = new Map<string, PayWeekOption>();

  for (let offset = -futureCount; offset <= pastCount; offset += 1) {
    const start = new Date(currentStart);
    start.setDate(start.getDate() - offset * 7);
    const option = buildPayWeekOption(start);
    optionByStart.set(option.startIso, option);
  }

  return [...optionByStart.values()].sort((left, right) =>
    right.startIso.localeCompare(left.startIso)
  );
}

export function isDateInPayWeek(
  isoDate: string,
  weekStartIso: string,
  weekEndIso: string
): boolean {
  return isoDate >= weekStartIso && isoDate <= weekEndIso;
}

export function isCurrentPayWeek(weekStartIso: string, weekEndIso: string): boolean {
  const today = localIsoDate();
  return isDateInPayWeek(today, weekStartIso, weekEndIso);
}
