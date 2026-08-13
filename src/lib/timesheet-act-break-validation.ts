import { normalizeLeaveTypeLabel } from "./leave-type-calendar";
import {
  validateBreakSlot,
  type TimesheetActivitySlot,
  type TimesheetBreakSlot,
} from "./timesheet-utils";
import { hasWorkLineItems } from "./timesheet-line-items";
import {
  isWorkerStateRegion,
  normalizeWorkerStateRegion,
  type WorkerStateRegion,
} from "./worker-state-region";

export const ACT_BREAK_REQUIRED_MESSAGE =
  "Workers based in ACT must record a break for work shifts.";

const WORK_ACTIVITY_LABEL = "WORKING ON SITE";

const LEAVE_TIMESHEET_ACTIVITY_TYPES = new Set([
  "Leave",
  "Annual Leave",
  "Personal Leave",
  "Sick Leave",
  "Carers Leave",
  "Leave without pay",
  "RDO",
  "Flexi RDO",
  "Public Holiday",
]);

const LEAVE_TIMESHEET_NOTE_MARKERS = [
  "auto-generated from approved leave request",
  "annual leave",
  "personal leave",
  "sick leave",
  "carers leave",
  "leave without pay",
  "public holiday",
  " flexi rdo",
  " rdo",
  "paid leave",
];

export function isActWorkerState(state: string | null | undefined): boolean {
  return normalizeWorkerStateRegion(state) === "ACT";
}

export function hasRecordedTimesheetBreak(
  breaks: TimesheetBreakSlot[],
  breakMinutes?: number | null,
  breakHours?: number | null
): boolean {
  const hasValidSlot = breaks.some(
    (row) => validateBreakSlot(row.startTime, row.endTime) === null
  );
  if (hasValidSlot) return true;
  if (Number(breakMinutes ?? 0) > 0) return true;
  if (Number(breakHours ?? 0) > 0) return true;
  return false;
}

function isLeaveTimesheetActivityLabel(label: string): boolean {
  const normalized = normalizeLeaveTypeLabel(label);
  return LEAVE_TIMESHEET_ACTIVITY_TYPES.has(normalized);
}

/** True for manual work-hour submissions; false for leave or auto-generated rows. */
export function isStandardWorkTimesheetSubmission(input: {
  leaveRequestId?: string | null;
  notes?: string | null;
  activities?: Array<Pick<TimesheetActivitySlot, "label"> | { label?: string }>;
}): boolean {
  if (input.leaveRequestId) return false;

  const notes = String(input.notes ?? "").toLowerCase();
  if (notes.includes("auto-generated from approved leave request")) {
    return false;
  }

  for (const marker of LEAVE_TIMESHEET_NOTE_MARKERS) {
    if (notes.includes(marker)) return false;
  }

  const activities = input.activities ?? [];
  if (hasWorkLineItems(activities as TimesheetActivitySlot[])) return true;
  if (activities.length === 0) return true;

  for (const activity of activities) {
    const label = String(activity.label ?? "").trim();
    if (!label) continue;
    if (label.toUpperCase() === WORK_ACTIVITY_LABEL) continue;
    if (isLeaveTimesheetActivityLabel(label)) return false;
  }

  return true;
}

export interface ActBreakValidationInput {
  workerState?: string | null;
  submit?: boolean;
  breaks?: TimesheetBreakSlot[];
  breakMinutes?: number | null;
  breakHours?: number | null;
  leaveRequestId?: string | null;
  notes?: string | null;
  activities?: Array<Pick<TimesheetActivitySlot, "label"> | { label?: string }>;
}

export function validateActBreakRequirement(
  input: ActBreakValidationInput
): string | null {
  if (!input.submit) return null;
  if (!isActWorkerState(input.workerState)) return null;
  if (
    !hasWorkLineItems(
      (input.activities ?? []) as TimesheetActivitySlot[]
    )
  ) {
    return null;
  }
  if (input.leaveRequestId) return null;

  const notes = String(input.notes ?? "").toLowerCase();
  if (notes.includes("auto-generated from approved leave request")) {
    return null;
  }

  if (
    hasRecordedTimesheetBreak(
      input.breaks ?? [],
      input.breakMinutes,
      input.breakHours
    )
  ) {
    return null;
  }

  return ACT_BREAK_REQUIRED_MESSAGE;
}

export function validateActBreakForTimesheetPayload(
  workerState: string | null | undefined,
  payload: Record<string, unknown>
): string | null {
  const breaks = normalizeBreaksFromPayload(payload);
  const activities = normalizeActivitiesFromPayload(payload);

  return validateActBreakRequirement({
    workerState,
    submit: true,
    breaks,
    breakMinutes: Number(payload.break_minutes ?? 0),
    breakHours: Number(payload.break_hours ?? 0),
    leaveRequestId:
      payload.leave_request_id != null ? String(payload.leave_request_id) : null,
    notes: payload.notes != null ? String(payload.notes) : null,
    activities,
  });
}

function normalizeBreaksFromPayload(
  payload: Record<string, unknown>
): TimesheetBreakSlot[] {
  const raw = payload.breaks;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const startTime = String(row.start_time ?? row.startTime ?? "").slice(0, 5);
      const endTime = String(row.end_time ?? row.endTime ?? "").slice(0, 5);
      if (!startTime || !endTime) return null;
      return {
        id: String(row.id ?? `break-${startTime}`),
        startTime,
        endTime,
      } satisfies TimesheetBreakSlot;
    })
    .filter((item): item is TimesheetBreakSlot => item !== null);
}

function normalizeActivitiesFromPayload(
  payload: Record<string, unknown>
): Array<{ label?: string }> {
  const raw = payload.activities ?? payload.entries;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      return { label: String(row.label ?? "") };
    })
    .filter((item): item is { label: string } => item !== null);
}

export function resolveWorkerStateForBreakValidation(
  state: string | null | undefined
): WorkerStateRegion | null {
  return normalizeWorkerStateRegion(state);
}
