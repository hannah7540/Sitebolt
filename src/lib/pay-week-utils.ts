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

/** Working days checked for missing timesheets. Sunday is excluded. */
export const PAY_WEEK_WORKING_DAY_OFFSETS = [0, 1, 2, 3, 5, 6] as const;

export const PAY_WEEK_WORKING_DAY_SHORT_LABELS = [
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Mon",
  "Tue",
] as const;

export const PAY_WEEK_WORKING_DAY_FULL_LABELS = [
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Monday",
  "Tuesday",
] as const;

export interface PayWeekWorkingDay {
  iso: string;
  offset: number;
  shortLabel: (typeof PAY_WEEK_WORKING_DAY_SHORT_LABELS)[number];
  fullLabel: (typeof PAY_WEEK_WORKING_DAY_FULL_LABELS)[number];
}

/** Parse YYYY-MM-DD as a local calendar date (no UTC shift). */
export function parseLocalIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Add whole days to a YYYY-MM-DD local date, crossing month/year boundaries safely. */
export function addDaysToLocalIso(iso: string, days: number): string {
  const parsed = parseLocalIsoDate(iso);
  if (!parsed) return "";
  parsed.setDate(parsed.getDate() + days);
  return localIsoDate(parsed);
}

export function getPayWeekWorkingDays(weekStartIso: string): PayWeekWorkingDay[] {
  const start = resolvePayWeekOption(weekStartIso).startIso;
  return PAY_WEEK_WORKING_DAY_OFFSETS.map((offset, index) => ({
    iso: addDaysToLocalIso(start, offset),
    offset,
    shortLabel: PAY_WEEK_WORKING_DAY_SHORT_LABELS[index],
    fullLabel: PAY_WEEK_WORKING_DAY_FULL_LABELS[index],
  })).filter((day) => Boolean(day.iso));
}
