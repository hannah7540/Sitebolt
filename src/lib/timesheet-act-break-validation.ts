import { normalizeLeaveTypeLabel } from "./leave-type-calendar";
import {
  calculateSlotMinutes,
  minutesToHours,
  validateBreakSlot,
  type TimesheetActivitySlot,
  type TimesheetBreakSlot,
} from "./timesheet-utils";
import {
  hasWorkLineItems,
  isLeaveLineCategory,
  resolveLineCategory,
} from "./timesheet-line-items";
import {
  normalizeWorkerStateRegion,
  type WorkerStateRegion,
} from "./worker-state-region";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isWaTimesheetJurisdiction } from "@/lib/payroll/rules/wa";

/** Break is only mandatory when elapsed shift duration exceeds this threshold. */
export const TIMESHEET_BREAK_REQUIRED_AFTER_HOURS = 4.5;

export const TIMESHEET_BREAK_OVER_THRESHOLD_MESSAGE =
  "Break is required for shifts over 4.5 hours";

/** @deprecated Prefer TIMESHEET_BREAK_OVER_THRESHOLD_MESSAGE */
export const ACT_BREAK_REQUIRED_MESSAGE = TIMESHEET_BREAK_OVER_THRESHOLD_MESSAGE;

/** @deprecated Prefer TIMESHEET_BREAK_OVER_THRESHOLD_MESSAGE */
export const WA_BREAK_REQUIRED_MESSAGE_ALIAS = TIMESHEET_BREAK_OVER_THRESHOLD_MESSAGE;

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

export function isActPayRuleName(name: string | null | undefined): boolean {
  const normalized = String(name ?? "").trim().toUpperCase();
  if (!normalized) return false;
  return normalized.startsWith("ACT") || /(^|[^A-Z])ACT([^A-Z]|$)/.test(normalized);
}

/** True when the worker's state or assigned pay rule is ACT. */
export function isActTimesheetJurisdiction(input: {
  workerState?: string | null;
  payRuleName?: string | null;
}): boolean {
  return isActWorkerState(input.workerState) || isActPayRuleName(input.payRuleName);
}

export function isBreakRuleJurisdiction(input: {
  workerState?: string | null;
  payRuleName?: string | null;
}): boolean {
  return (
    isActTimesheetJurisdiction(input) || isWaTimesheetJurisdiction(input)
  );
}

/**
 * Elapsed shift hours from work activities (End − Start), or explicit
 * start/end / shiftHours overrides. Returns null when duration is unknown.
 */
export function resolveTimesheetShiftHours(input: {
  activities?: Array<
    Partial<TimesheetActivitySlot> & { label?: string; category?: string | null }
  >;
  startTime?: string | null;
  endTime?: string | null;
  shiftHours?: number | null;
}): number | null {
  if (input.shiftHours != null && Number.isFinite(Number(input.shiftHours))) {
    return Math.max(0, Number(input.shiftHours));
  }

  const activities = input.activities ?? [];
  let totalMinutes = 0;
  let hasTimedWork = false;

  for (const activity of activities) {
    const category = resolveLineCategory({
      id: String(activity.id ?? "activity"),
      startTime: String(activity.startTime ?? ""),
      endTime: String(activity.endTime ?? ""),
      label: String(activity.label ?? ""),
      category: activity.category as TimesheetActivitySlot["category"],
    });
    if (isLeaveLineCategory(category)) continue;

    const start = activity.startTime?.trim() || "";
    const end = activity.endTime?.trim() || "";
    if (!start || !end) continue;

    hasTimedWork = true;
    totalMinutes += calculateSlotMinutes(start, end);
  }

  if (hasTimedWork) {
    return minutesToHours(totalMinutes);
  }

  const start = input.startTime?.trim() || "";
  const end = input.endTime?.trim() || "";
  if (start && end) {
    return minutesToHours(calculateSlotMinutes(start, end));
  }

  return null;
}

/**
 * Jurisdiction supports mandatory breaks AND this shift is over 4.5 hours
 * (or duration is unknown — fail closed for long/default work days).
 */
export function requiresMandatoryTimesheetBreak(input: {
  workerState?: string | null;
  payRuleName?: string | null;
  activities?: Array<
    Partial<TimesheetActivitySlot> & { label?: string; category?: string | null }
  >;
  startTime?: string | null;
  endTime?: string | null;
  shiftHours?: number | null;
}): boolean {
  if (!isBreakRuleJurisdiction(input)) return false;

  const shiftHours = resolveTimesheetShiftHours(input);
  if (shiftHours != null && shiftHours <= TIMESHEET_BREAK_REQUIRED_AFTER_HOURS) {
    return false;
  }

  return true;
}

export function mandatoryTimesheetBreakMessage(_input?: {
  workerState?: string | null;
  payRuleName?: string | null;
}): string {
  return TIMESHEET_BREAK_OVER_THRESHOLD_MESSAGE;
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
  payRuleName?: string | null;
  submit?: boolean;
  breaks?: TimesheetBreakSlot[];
  breakMinutes?: number | null;
  breakHours?: number | null;
  leaveRequestId?: string | null;
  notes?: string | null;
  activities?: Array<
    Partial<TimesheetActivitySlot> & { label?: string; category?: string | null }
  >;
  startTime?: string | null;
  endTime?: string | null;
  shiftHours?: number | null;
}

export function validateActBreakRequirement(
  input: ActBreakValidationInput
): string | null {
  if (!input.submit) return null;
  if (!isBreakRuleJurisdiction(input)) {
    return null;
  }
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

  const shiftHours = resolveTimesheetShiftHours(input);
  if (shiftHours != null && shiftHours <= TIMESHEET_BREAK_REQUIRED_AFTER_HOURS) {
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

  return TIMESHEET_BREAK_OVER_THRESHOLD_MESSAGE;
}

export function validateActBreakForTimesheetPayload(
  workerState: string | null | undefined,
  payload: Record<string, unknown>,
  payRuleName?: string | null
): string | null {
  const breaks = normalizeBreaksFromPayload(payload);
  const activities = normalizeActivitiesFromPayload(payload);

  return validateActBreakRequirement({
    workerState,
    payRuleName,
    submit: true,
    breaks,
    breakMinutes: Number(payload.break_minutes ?? 0) || 0,
    breakHours: Number(payload.break_hours ?? 0) || 0,
    leaveRequestId:
      payload.leave_request_id != null ? String(payload.leave_request_id) : null,
    notes: payload.notes != null ? String(payload.notes) : null,
    activities,
    startTime:
      payload.start_time != null ? String(payload.start_time) : null,
    endTime:
      payload.finish_time != null
        ? String(payload.finish_time)
        : payload.end_time != null
          ? String(payload.end_time)
          : null,
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
): Array<Partial<TimesheetActivitySlot> & { label?: string }> {
  const raw = payload.activities ?? payload.entries;
  if (!Array.isArray(raw)) return [];

  const parsed: Array<Partial<TimesheetActivitySlot> & { label?: string }> = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const categoryRaw =
      row.category != null ? String(row.category).trim() : "";
    parsed.push({
      id: String(row.id ?? "activity"),
      label: String(row.label ?? ""),
      startTime: String(row.start_time ?? row.startTime ?? "").trim() || undefined,
      endTime: String(row.end_time ?? row.endTime ?? "").trim() || undefined,
      ...(categoryRaw
        ? { category: categoryRaw as NonNullable<TimesheetActivitySlot["category"]> }
        : {}),
    });
  }

  return parsed;
}

export function resolveWorkerStateForBreakValidation(
  state: string | null | undefined
): WorkerStateRegion | null {
  return normalizeWorkerStateRegion(state);
}

export async function resolveTimesheetBreakContext(
  client: SupabaseClient,
  workerId: string,
  providedState?: string | null
): Promise<{ workerState: string | null; payRuleName: string | null }> {
  const trimmedId = workerId.trim();
  if (!trimmedId) {
    const normalized = normalizeWorkerStateRegion(providedState);
    return {
      workerState: normalized ?? (providedState?.trim() || null),
      payRuleName: null,
    };
  }

  const { data } = await client
    .from("workers")
    .select("state, pay_rule_id, pay_rule_template_id")
    .eq("id", trimmedId)
    .maybeSingle();

  const row = data as {
    state?: string | null;
    pay_rule_id?: string | null;
    pay_rule_template_id?: string | null;
  } | null;

  const rawState = providedState !== undefined ? providedState : row?.state;
  const normalized = normalizeWorkerStateRegion(rawState);
  const workerState = normalized ?? (typeof rawState === "string" ? rawState.trim() || null : null);

  const templateId = String(row?.pay_rule_template_id ?? row?.pay_rule_id ?? "").trim();
  let payRuleName: string | null = null;
  if (templateId) {
    const { data: template } = await client
      .from("pay_rule_templates")
      .select("name")
      .eq("id", templateId)
      .maybeSingle();
    const name = (template as { name?: string | null } | null)?.name;
    payRuleName = typeof name === "string" && name.trim() ? name.trim() : null;
  }

  return { workerState, payRuleName };
}
