import { supabase, isSupabaseConfigured, type WorkerTimesheet } from "./supabase";
import {
  isSupabaseMissingColumnError,
  isSupabaseSchemaOrConstraintError,
  toSupabaseRequestError,
} from "./supabase-errors";
import {
  parseMissingColumnFromError,
  stripMissingColumn,
  nullIfBlank,
  sanitizeWritePayload,
} from "./form-payload-utils";
import {
  calculateDailyTotalsFromSlots,
  calculateSlotMinutes,
  calculateTimesheetHours,
  minutesToHours,
  minutesToTimeString,
  timeToMinutes,
  type TimesheetActivitySlot,
  type TimesheetBreakSlot,
} from "./timesheet-utils";
import {
  resolveTimesheetBreakContext,
  validateActBreakRequirement,
} from "./timesheet-act-break-validation";
import { mapTimesheetRow } from "./timesheet-entries";
import {
  formatTimesheetProjectDisplayName,
  type TimesheetProject,
} from "./timesheet-options";
import { syncLineItemFields } from "./timesheet-line-items";
import { calculateTimesheetPay } from "./calculateTimesheetPay";
import type { PayRateRule } from "./pay-rates-and-rules";
import { isLeavePreviewTimesheetRow, type AccountsTimesheetRow } from "./accounts-timesheets";

const OPTIONAL_UPDATE_COLUMNS = [
  "work_hours",
  "break_hours",
  "daily_total_hours",
  "activities",
  "breaks",
  "worker_trade",
  "overtime_hours",
  "form_metadata",
  "updated_at",
] as const;

export interface UpdateAccountsTimesheetInput {
  id: string;
  workerId: string;
  workDate: string;
  projectId: string | null;
  timesheetProject?: TimesheetProject | null;
  projectName?: string | null;
  startTime: string;
  finishTime: string;
  breakMinutes: number;
  breakStartTime?: string;
  breakEndTime?: string;
  totalHours?: number | null;
  notes?: string | null;
  plantOperated?: string | null;
  workerState?: string | null;
  workerTrade?: string | null;
  activities?: TimesheetActivitySlot[];
}

export interface UpdateAccountsTimesheetPayContext {
  payRule: PayRateRule | null;
  hsrApplicable?: boolean;
  isApprentice?: boolean;
  hasCompanyVehicle?: boolean;
}

function stripUndefined(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

function applyTimesToActivities(
  activities: TimesheetActivitySlot[],
  startTime: string,
  finishTime: string
): TimesheetActivitySlot[] {
  if (activities.length === 0) {
    return [
      syncLineItemFields({
        id: `activity-${Date.now()}`,
        startTime,
        endTime: finishTime,
        label: "WORKING ON SITE",
        category: "work",
      }),
    ];
  }

  return activities.map((row, index, all) => {
    const next = { ...row };
    if (index === 0) next.startTime = startTime;
    if (index === all.length - 1) next.endTime = finishTime;
    return syncLineItemFields(next);
  });
}

export function resolveAccountsTimesheetBreaks(input: {
  breakStartTime?: string;
  breakEndTime?: string;
  breakMinutes?: number;
}): TimesheetBreakSlot[] {
  const startTime = input.breakStartTime?.slice(0, 5) ?? "";
  const endTime = input.breakEndTime?.slice(0, 5) ?? "";
  if (startTime && endTime) {
    return [
      {
        id: `break-${startTime}`,
        startTime,
        endTime,
      },
    ];
  }

  const minutes = Math.max(0, Math.round(Number(input.breakMinutes) || 0));
  if (minutes <= 0) return [];

  const startMinutes = timeToMinutes("09:30");
  return [
    {
      id: `break-duration-${minutes}`,
      startTime: "09:30",
      endTime: minutesToTimeString(startMinutes + minutes),
    },
  ];
}

function isFormMetadataRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readExistingFormMetadata(
  id: string
): Promise<{ write: boolean; metadata: Record<string, unknown> }> {
  const { data, error } = await supabase
    .from("worker_timesheets")
    .select("form_metadata")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { write: false, metadata: {} };
  }

  const meta = (data as { form_metadata?: unknown } | null)?.form_metadata;
  return {
    write: true,
    metadata: isFormMetadataRecord(meta) ? { ...meta } : {},
  };
}

function mergePlantOperatedMetadata(
  existing: Record<string, unknown>,
  plantOperated?: string | null
): Record<string, unknown> | null {
  const next = { ...existing };
  const plant = plantOperated?.trim() || "";
  if (plant) {
    next.plant_operated = plant;
  } else {
    delete next.plant_operated;
  }
  return Object.keys(next).length > 0 ? next : null;
}

function resolveOvertimeHours(
  draft: WorkerTimesheet,
  payContext?: UpdateAccountsTimesheetPayContext
): number {
  if (payContext?.payRule) {
    return calculateTimesheetPay(draft, payContext.payRule, {
      hsrApplicable: payContext.hsrApplicable ?? false,
      isApprentice: payContext.isApprentice ?? false,
      hasCompanyVehicle: payContext.hasCompanyVehicle ?? false,
    }).overtime_hours;
  }

  return Math.max(0, Math.round((Number(draft.total_hours) - 8) * 100) / 100);
}

export function mergeAccountsTimesheetRow(
  previous: AccountsTimesheetRow,
  updated: WorkerTimesheet
): AccountsTimesheetRow {
  return {
    ...previous,
    ...updated,
    worker_name: previous.worker_name,
    worker_first_name: previous.worker_first_name,
    worker_last_name: previous.worker_last_name,
    worker_trade: updated.worker_trade ?? previous.worker_trade,
    pay_rate_id: previous.pay_rate_id,
    worker_is_hsr: previous.worker_is_hsr,
    worker_is_apprentice: previous.worker_is_apprentice,
    worker_has_company_vehicle: previous.worker_has_company_vehicle,
    worker_state: previous.worker_state,
    is_leave_preview: previous.is_leave_preview,
    leave_preview_request_status: previous.leave_preview_request_status,
  };
}

export async function updateAccountsTimesheet(
  input: UpdateAccountsTimesheetInput,
  payContext?: UpdateAccountsTimesheetPayContext
): Promise<{ error: string | null; data: WorkerTimesheet | null }> {
  if (!input.id.trim()) {
    return { error: "Timesheet id is required.", data: null };
  }
  if (isLeavePreviewTimesheetRow({ id: input.id, is_leave_preview: false })) {
    return { error: "Leave preview rows cannot be edited.", data: null };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", data: null };
  }

  const startTime = input.startTime.slice(0, 5);
  const finishTime = input.finishTime.slice(0, 5);
  if (!startTime || !finishTime) {
    return { error: "Start and finish times are required.", data: null };
  }

  const breaks = resolveAccountsTimesheetBreaks(input);
  const slotBreakMinutes =
    breaks.length > 0 ? calculateSlotMinutes(breaks[0]!.startTime, breaks[0]!.endTime) : 0;
  const breakMinutes =
    slotBreakMinutes > 0 ? slotBreakMinutes : Math.max(0, Math.round(Number(input.breakMinutes) || 0));
  const breakHours = minutesToHours(breakMinutes);

  const activities = applyTimesToActivities(input.activities ?? [], startTime, finishTime);
  const slotTotals = calculateDailyTotalsFromSlots(activities, breaks);
  const calculatedHours = calculateTimesheetHours(startTime, finishTime, breakMinutes);
  const totalHours =
    input.totalHours != null && Number.isFinite(Number(input.totalHours))
      ? Math.max(0, Number(input.totalHours))
      : slotTotals.dailyTotalHours || calculatedHours;

  if (totalHours <= 0) {
    return { error: "Daily total must be greater than 0 hours.", data: null };
  }

  const { workerState, payRuleName } = await resolveTimesheetBreakContext(
    supabase,
    input.workerId,
    input.workerState
  );
  const actBreakError = validateActBreakRequirement({
    workerState,
    payRuleName,
    submit: true,
    breaks,
    breakMinutes,
    breakHours,
    notes: input.notes,
    activities,
  });
  if (actBreakError) {
    return { error: actBreakError, data: null };
  }

  let projectId = input.projectId;
  let projectName = input.projectName?.trim() || "General / Unassigned";
  if (input.timesheetProject) {
    projectId = input.timesheetProject.id;
    projectName = formatTimesheetProjectDisplayName(input.timesheetProject);
  }

  const workHours = Math.max(0, Math.round((calculatedHours) * 100) / 100);
  const draft: WorkerTimesheet = {
    id: input.id,
    worker_id: input.workerId,
    work_date: input.workDate,
    project_id: projectId,
    project_name: projectName,
    worker_trade: input.workerTrade ?? null,
    start_time: startTime,
    finish_time: finishTime,
    break_minutes: breakMinutes,
    total_hours: totalHours,
    work_hours: workHours,
    break_hours: breakHours,
    daily_total_hours: totalHours,
    activities,
    breaks,
    notes: input.notes?.trim() || null,
    status: "pending",
  };
  const overtimeHours = resolveOvertimeHours(draft, payContext);
  const existingMeta = await readExistingFormMetadata(input.id);
  const formMetadata = existingMeta.write
    ? mergePlantOperatedMetadata(existingMeta.metadata, input.plantOperated)
    : undefined;

  let payload: Record<string, unknown> = sanitizeWritePayload(
    stripUndefined({
      project_id: projectId,
      project_name: projectName,
      worker_trade: input.workerTrade?.trim() || null,
      start_time: startTime,
      finish_time: finishTime,
      break_minutes: breakMinutes,
      total_hours: totalHours,
      work_hours: workHours,
      break_hours: breakHours,
      daily_total_hours: totalHours,
      activities: activities.map((row) => ({
        id: row.id,
        start_time: row.startTime,
        end_time: row.endTime,
        label: row.label,
        category: row.category,
        duration_mode: row.durationMode,
        hours: row.hours,
      })),
      breaks: breaks.map((row) => ({
        id: row.id,
        start_time: row.startTime,
        end_time: row.endTime,
      })),
      notes: nullIfBlank(input.notes),
      overtime_hours: overtimeHours,
      form_metadata: formMetadata,
      updated_at: new Date().toISOString(),
    })
  );

  for (let attempt = 0; attempt <= OPTIONAL_UPDATE_COLUMNS.length + 2; attempt += 1) {
    const { data, error } = await supabase
      .from("worker_timesheets")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();

    if (!error && data) {
      return {
        error: null,
        data: {
          ...mapTimesheetRow(data as Record<string, unknown>),
          overtime_hours: overtimeHours,
          total_hours: totalHours,
          work_hours: workHours,
          break_hours: breakHours,
          daily_total_hours: totalHours,
        },
      };
    }

    if (error && isSupabaseMissingColumnError(error)) {
      const parsed = parseMissingColumnFromError(error.message);
      if (parsed && parsed in payload) {
        payload = stripMissingColumn(payload, parsed);
        continue;
      }
    }

    if (error && isSupabaseSchemaOrConstraintError(toSupabaseRequestError(error))) {
      const parsed = parseMissingColumnFromError(error.message);
      if (parsed && parsed in payload) {
        payload = stripMissingColumn(payload, parsed);
        continue;
      }
    }

    return { error: error?.message ?? "Failed to update timesheet.", data: null };
  }

  return { error: "Failed to update timesheet.", data: null };
}
