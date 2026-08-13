import type { WorkerTimesheet } from "./supabase";
import {
  addHoursToTime,
  calculateSlotMinutes,
  DEFAULT_TIMESHEET_END_TIME,
  DEFAULT_TIMESHEET_SEGMENT_HOURS,
  DEFAULT_TIMESHEET_START_TIME,
  minutesToHours,
  minutesToTimeString,
  timeToMinutes,
  validateLineItemTimeRange,
  type TimesheetActivitySlot,
} from "./timesheet-utils";

export {
  DEFAULT_TIMESHEET_END_TIME,
  DEFAULT_TIMESHEET_SEGMENT_HOURS,
  DEFAULT_TIMESHEET_START_TIME,
} from "./timesheet-utils";

export const TIMESHEET_FULL_DAY_HOURS = 8;

export type TimesheetLineCategory =
  | "work"
  | "sick_leave"
  | "personal_leave"
  | "annual_leave"
  | "carers_leave"
  | "wfh"
  | "rdo"
  | "public_holiday";

export type TimesheetDurationMode = "full_day" | "partial";

export interface TimesheetLineCategoryOption {
  value: TimesheetLineCategory;
  label: string;
}

export const TIMESHEET_LINE_CATEGORY_OPTIONS: TimesheetLineCategoryOption[] = [
  { value: "work", label: "Work / On Site" },
  { value: "sick_leave", label: "Sick Leave" },
  { value: "personal_leave", label: "Personal Leave" },
  { value: "annual_leave", label: "Annual Leave" },
  { value: "carers_leave", label: "Carers Leave" },
  { value: "wfh", label: "WFH" },
  { value: "rdo", label: "RDO" },
  { value: "public_holiday", label: "Public Holiday" },
];

export interface ResolvedTimesheetLineItem {
  id: string;
  category: TimesheetLineCategory;
  label: string;
  hours: number;
  durationMode: TimesheetDurationMode;
  startTime: string;
  endTime: string;
}

const CATEGORY_LABELS: Record<TimesheetLineCategory, string> = {
  work: "Work / On Site",
  sick_leave: "Sick Leave",
  personal_leave: "Personal Leave",
  annual_leave: "Annual Leave",
  carers_leave: "Carers Leave",
  wfh: "WFH",
  rdo: "RDO",
  public_holiday: "Public Holiday",
};

const LABEL_TO_CATEGORY: Record<string, TimesheetLineCategory> = {
  "working on site": "work",
  work: "work",
  "sick leave": "sick_leave",
  sick: "sick_leave",
  "personal leave": "personal_leave",
  "annual leave": "annual_leave",
  "carers leave": "carers_leave",
  wfh: "wfh",
  "work from home": "wfh",
  rdo: "rdo",
  "flexi rdo": "rdo",
  "public holiday": "public_holiday",
};

export function isLeaveLineCategory(
  category: TimesheetLineCategory | undefined | null
): boolean {
  return category != null && category !== "work";
}

export function getLineCategoryLabel(category: TimesheetLineCategory): string {
  return CATEGORY_LABELS[category];
}

export function inferCategoryFromLabel(label: string): TimesheetLineCategory {
  const normalized = label.trim().toLowerCase();
  return LABEL_TO_CATEGORY[normalized] ?? "work";
}

export function resolveLineCategory(slot: TimesheetActivitySlot): TimesheetLineCategory {
  if (slot.category) return slot.category;
  return inferCategoryFromLabel(slot.label);
}

export function resolveLineDurationMode(
  slot: TimesheetActivitySlot
): TimesheetDurationMode {
  if (slot.durationMode) return slot.durationMode;
  const category = resolveLineCategory(slot);
  if (!isLeaveLineCategory(category)) return "partial";

  const startTime = slot.startTime || DEFAULT_TIMESHEET_START_TIME;
  const endTime = slot.endTime || DEFAULT_TIMESHEET_END_TIME;
  const hours = minutesToHours(calculateSlotMinutes(startTime, endTime));
  if (
    startTime === DEFAULT_TIMESHEET_START_TIME &&
    endTime === DEFAULT_TIMESHEET_END_TIME &&
    hours === TIMESHEET_FULL_DAY_HOURS
  ) {
    return "full_day";
  }
  return "partial";
}

/** Gross hours from the entry start/finish time range. */
export function resolveLineItemSegmentHours(slot: TimesheetActivitySlot): number {
  const startTime = slot.startTime || DEFAULT_TIMESHEET_START_TIME;
  const endTime = slot.endTime || DEFAULT_TIMESHEET_END_TIME;
  if (!startTime || !endTime) return 0;
  return minutesToHours(calculateSlotMinutes(startTime, endTime));
}

/** Paid hours for pay rules — derived from start/finish times. */
export function resolveLineItemHours(slot: TimesheetActivitySlot): number {
  return resolveLineItemSegmentHours(slot);
}

export function resolveLineItemNetWorkHours(
  slot: TimesheetActivitySlot,
  activities: TimesheetActivitySlot[],
  breakHours: number
): number {
  if (resolveLineCategory(slot) !== "work") {
    return resolveLineItemSegmentHours(slot);
  }

  const gross = resolveLineItemSegmentHours(slot);
  const workSlots = activities.filter(
    (row) => resolveLineCategory(row) === "work" && resolveLineItemSegmentHours(row) > 0
  );

  if (workSlots.length !== 1 || breakHours <= 0) {
    return gross;
  }

  return Math.max(0, Math.round((gross - breakHours) * 100) / 100);
}

export function syncLineItemFields(
  slot: TimesheetActivitySlot
): TimesheetActivitySlot {
  const category = resolveLineCategory(slot);
  let durationMode = resolveLineDurationMode(slot);
  const label = getLineCategoryLabel(category);

  let startTime = slot.startTime || DEFAULT_TIMESHEET_START_TIME;
  let endTime = slot.endTime || DEFAULT_TIMESHEET_END_TIME;

  if (isLeaveLineCategory(category) && durationMode === "full_day") {
    startTime = DEFAULT_TIMESHEET_START_TIME;
    endTime = DEFAULT_TIMESHEET_END_TIME;
  }

  const hours = resolveLineItemSegmentHours({
    ...slot,
    startTime,
    endTime,
    category,
    durationMode,
  });

  if (
    isLeaveLineCategory(category) &&
    durationMode === "full_day" &&
    hours === TIMESHEET_FULL_DAY_HOURS
  ) {
    durationMode = "full_day";
  } else if (isLeaveLineCategory(category) && durationMode === "full_day" && hours !== TIMESHEET_FULL_DAY_HOURS) {
    durationMode = "partial";
  }

  return {
    ...slot,
    startTime,
    endTime,
    category,
    durationMode,
    label,
    hours,
  };
}

export function createDefaultLineItem(
  category: TimesheetLineCategory = "work"
): TimesheetActivitySlot {
  return syncLineItemFields({
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category,
    durationMode: "partial",
    startTime: DEFAULT_TIMESHEET_START_TIME,
    endTime: DEFAULT_TIMESHEET_END_TIME,
    label: getLineCategoryLabel(category),
  });
}

/** Chain a new entry from the previous row's finish time through to 2:30 PM or +4 hrs. */
export function createChainedLineItem(
  previous: TimesheetActivitySlot | null | undefined,
  category: TimesheetLineCategory = "work"
): TimesheetActivitySlot {
  if (!previous) {
    return createDefaultLineItem(category);
  }

  const syncedPrevious = syncLineItemFields(previous);
  const startTime = syncedPrevious.endTime || DEFAULT_TIMESHEET_START_TIME;
  const dayEndMinutes = timeToMinutes(DEFAULT_TIMESHEET_END_TIME);
  const startMinutes = timeToMinutes(startTime);
  const segmentEndMinutes = Math.min(
    dayEndMinutes,
    startMinutes + DEFAULT_TIMESHEET_SEGMENT_HOURS * 60
  );
  let endTime = minutesToTimeString(segmentEndMinutes);

  if (segmentEndMinutes <= startMinutes) {
    endTime = addHoursToTime(startTime, DEFAULT_TIMESHEET_SEGMENT_HOURS);
  }

  return syncLineItemFields({
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category,
    durationMode: "partial",
    startTime,
    endTime,
    label: getLineCategoryLabel(category),
  });
}

export function resolveTimesheetLineItems(
  timesheet: Pick<WorkerTimesheet, "activities">
): ResolvedTimesheetLineItem[] {
  const activities = timesheet.activities ?? [];
  if (activities.length === 0) return [];

  return activities.map((slot) => {
    const synced = syncLineItemFields(slot);
    return {
      id: synced.id,
      category: resolveLineCategory(synced),
      label: getLineCategoryLabel(resolveLineCategory(synced)),
      hours: resolveLineItemHours(synced),
      durationMode: resolveLineDurationMode(synced),
      startTime: synced.startTime,
      endTime: synced.endTime,
    };
  });
}

export function sumLineItemHours(
  items: Array<Pick<ResolvedTimesheetLineItem, "hours">>
): number {
  return Math.round(items.reduce((sum, item) => sum + item.hours, 0) * 100) / 100;
}

export function sumWorkLineHours(activities: TimesheetActivitySlot[]): number {
  return sumLineItemHours(
    activities
      .filter((slot) => resolveLineCategory(slot) === "work")
      .map((slot) => ({ hours: resolveLineItemHours(syncLineItemFields(slot)) }))
  );
}

export function sumLeaveLineHours(activities: TimesheetActivitySlot[]): number {
  return sumLineItemHours(
    activities
      .filter((slot) => isLeaveLineCategory(resolveLineCategory(slot)))
      .map((slot) => ({ hours: resolveLineItemHours(syncLineItemFields(slot)) }))
  );
}

export function formatLineItemsSummary(
  items: ResolvedTimesheetLineItem[]
): string {
  if (items.length === 0) return "—";
  return items
    .map((item) => `${formatLineItemHours(item.hours)} ${item.label}`)
    .join(", ");
}

export function formatLineItemHours(hours: number): string {
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${hours.toFixed(1)}h`;
}

export function hasWorkLineItems(activities: TimesheetActivitySlot[]): boolean {
  return activities.some(
    (slot) =>
      resolveLineCategory(slot) === "work" && resolveLineItemHours(slot) > 0
  );
}

export function migrateActivityToLineItem(
  slot: TimesheetActivitySlot
): TimesheetActivitySlot {
  const category = slot.category ?? inferCategoryFromLabel(slot.label);
  const startTime = slot.startTime || DEFAULT_TIMESHEET_START_TIME;
  const endTime = slot.endTime || DEFAULT_TIMESHEET_END_TIME;

  return syncLineItemFields({
    ...slot,
    category,
    startTime,
    endTime,
    durationMode:
      slot.durationMode ??
      (isLeaveLineCategory(category) &&
      startTime === DEFAULT_TIMESHEET_START_TIME &&
      endTime === DEFAULT_TIMESHEET_END_TIME
        ? "full_day"
        : "partial"),
  });
}

export function validateLineItemSlot(slot: TimesheetActivitySlot): string | null {
  const synced = syncLineItemFields(slot);
  return validateLineItemTimeRange(synced.startTime, synced.endTime);
}
