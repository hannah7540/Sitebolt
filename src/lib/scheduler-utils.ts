/** Monday-based week utilities for the fleet scheduler */

export interface CalendarDay {
  date: Date;
  iso: string;
  label: string;
  dayName: string;
  isToday: boolean;
}

export function formatDateOnly(d: Date | string | null | undefined): string {
  if (d == null) return "";
  if (typeof d === "string") {
    const trimmed = d.trim();
    if (!trimmed) return "";
    return trimmed.split("T")[0];
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** @alias formatDateOnly */
export const toISODateString = formatDateOnly;

export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function getWeekDays(weekStart: Date): CalendarDay[] {
  const todayIso = toISODateString(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const iso = toISODateString(date);
    return {
      date,
      iso,
      label: date.getDate().toString(),
      dayName: date.toLocaleDateString("en-AU", { weekday: "short" }),
      isToday: iso === todayIso,
    };
  });
}

export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${weekStart.toLocaleDateString("en-AU", opts)} – ${end.toLocaleDateString("en-AU", { ...opts, year: "numeric" })}`;
}

/** Inclusive list of ISO dates from start through end. */
export function enumerateDateRange(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  const end = new Date(`${endDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return [];
  }

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(toISODateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function eventOnDay(
  startDate: string,
  endDate: string,
  dayIso: string
): boolean {
  const start = toISODateString(startDate);
  const end = toISODateString(endDate);
  const day = toISODateString(dayIso);
  if (!start || !end || !day) return false;
  return start <= day && end >= day;
}

/** Monday–Friday using local date (cellDateStr is YYYY-MM-DD). */
export function isWeekdayIso(dayIso: string): boolean {
  const normalized = toISODateString(dayIso);
  if (!normalized) return false;
  const date = new Date(`${normalized}T12:00:00`);
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

export function isWeekendIso(dayIso: string): boolean {
  const normalized = toISODateString(dayIso);
  if (!normalized) return false;
  const dayOfWeek = new Date(`${normalized}T12:00:00`).getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/** Keep Mon–Fri columns only (excludes Sat/Sun). */
export function filterWeekdayCalendarDays(days: CalendarDay[]): CalendarDay[] {
  return days.filter((day) => isWeekdayIso(day.iso));
}

export function getWeekdayCalendarDaysInRange(
  rangeStart: Date,
  rangeEnd: Date
): CalendarDay[] {
  return filterWeekdayCalendarDays(getCalendarDaysInRange(rangeStart, rangeEnd));
}

export function getFleetStatusLabel(
  plant: { status: string },
  serviceWarning: "none" | "due_soon" | "overdue"
): "Tagged Out" | "Service Due" | "Available" {
  if (plant.status === "out_of_service") return "Tagged Out";
  if (serviceWarning !== "none") return "Service Due";
  return "Available";
}

/** Horizontal worker calendar scroll layout constants */
export const CALENDAR_WEEKS_BEFORE = 4;
export const CALENDAR_WEEKS_AFTER = 12;
export const CALENDAR_WEEK_EXTEND = 4;
export const CALENDAR_DAY_COLUMN_WIDTH = 80;
export const CALENDAR_WORKER_COLUMN_WIDTH = 200;
/** Weekday columns added when extending the plant calendar scroll range. */
export const CALENDAR_WEEKDAY_SCROLL_EXTEND = CALENDAR_WEEK_EXTEND * 5;

export function getDefaultCalendarAnchor(): Date {
  return startOfWeekMonday(new Date());
}

export function getCalendarRangeStart(
  anchor: Date,
  weeksBefore = CALENDAR_WEEKS_BEFORE
): Date {
  return addDays(startOfWeekMonday(anchor), -weeksBefore * 7);
}

export function getCalendarRangeEnd(
  anchor: Date,
  weeksAfter = CALENDAR_WEEKS_AFTER
): Date {
  const anchorMonday = startOfWeekMonday(anchor);
  return addDays(anchorMonday, weeksAfter * 7 + 6);
}

export function getCalendarDaysInRange(
  rangeStart: Date,
  rangeEnd: Date
): CalendarDay[] {
  const todayIso = formatDateOnly(new Date());
  const days: CalendarDay[] = [];
  let cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(rangeEnd);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const iso = formatDateOnly(cursor);
    days.push({
      date: new Date(cursor),
      iso,
      label: cursor.getDate().toString(),
      dayName: cursor.toLocaleDateString("en-AU", { weekday: "short" }),
      isToday: iso === todayIso,
    });
    cursor = addDays(cursor, 1);
  }

  return days;
}

export function getWeekDaysContaining(dayIso: string): CalendarDay[] {
  const normalized = formatDateOnly(dayIso);
  if (!normalized) return [];
  const date = new Date(`${normalized}T12:00:00`);
  return getWeekDays(startOfWeekMonday(date));
}

export function formatCalendarScrollRange(
  rangeStart: Date,
  rangeEnd: Date
): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  return `${rangeStart.toLocaleDateString("en-AU", opts)} – ${rangeEnd.toLocaleDateString("en-AU", opts)}`;
}
