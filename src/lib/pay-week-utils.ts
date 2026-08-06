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

export function listPayWeekOptions(count = 16, anchor: Date = new Date()): PayWeekOption[] {
  const currentStart = getPayWeekStart(anchor);
  const options: PayWeekOption[] = [];

  for (let offset = 0; offset < count; offset += 1) {
    const start = new Date(currentStart);
    start.setDate(start.getDate() - offset * 7);
    const end = getPayWeekEnd(start);
    options.push({
      startIso: localIsoDate(start),
      endIso: localIsoDate(end),
      label: formatPayWeekRange(start, end),
    });
  }

  return options;
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
