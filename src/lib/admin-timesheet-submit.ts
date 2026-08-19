import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSupabaseSchemaOrConstraintError,
  toSupabaseRequestError,
} from "./supabase-errors";
import { nullIfBlank, nullIfBlankDate, sanitizeWritePayload } from "./form-payload-utils";
import {
  calculateDailyTotalsFromSlots,
  validateTimesheetWorkDate,
  type TimesheetActivitySlot,
  type TimesheetBreakSlot,
} from "./timesheet-utils";
import { validateActBreakRequirement } from "./timesheet-act-break-validation";
import { normalizeWorkerStateRegion } from "./worker-state-region";
import {
  formatTimesheetProjectDisplayName,
  type TimesheetProject,
} from "./timesheet-options";
import { syncLineItemFields } from "./timesheet-line-items";
import { mapTimesheetRow, type SaveWorkerTimesheetInput } from "./timesheet-entries";
import { resolveTimesheetOvertimeHours } from "./accounts-timesheets";
import type { WorkerTimesheet } from "./supabase";

export interface AdminTimesheetSubmitInput {
  workerId: string;
  workDate: string;
  projectId: string | null;
  timesheetProject?: TimesheetProject | null;
  timesheetTaskName?: string | null;
  workerTrade?: string | null;
  activities: TimesheetActivitySlot[];
  breaks?: TimesheetBreakSlot[];
  breakMinutes?: number;
  notes?: string | null;
  workerState?: string | null;
  approvedBy: string;
  submittedByAdmin?: boolean;
}

function stripUndefined(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

function buildApprovedAdminPayload(
  input: AdminTimesheetSubmitInput,
  projectId: string,
  projectName: string,
  totals: ReturnType<typeof calculateDailyTotalsFromSlots>,
  approvedBy: string
): Record<string, unknown> {
  const now = new Date().toISOString();
  const syncedActivities = input.activities.map(syncLineItemFields);
  const firstActivity = syncedActivities[0];
  const lastActivity = syncedActivities[syncedActivities.length - 1];
  const breakMinutes = Math.round(totals.breakHours * 60);

  const rowForOvertime = {
    total_hours: totals.dailyTotalHours,
    overtime_hours: 0,
  } as WorkerTimesheet;
  const overtimeHours = resolveTimesheetOvertimeHours(rowForOvertime);

  const projectCode = input.timesheetProject?.code?.trim();

  return sanitizeWritePayload(
    stripUndefined({
      worker_id: input.workerId,
      work_date: nullIfBlankDate(input.workDate) ?? input.workDate,
      project_id: projectId,
      project_name: projectName,
      project_code: projectCode || undefined,
      worker_trade: input.workerTrade?.trim() || input.timesheetTaskName?.trim() || null,
      start_time: firstActivity?.startTime ?? "06:30",
      finish_time: lastActivity?.endTime ?? "14:30",
      break_minutes: breakMinutes,
      total_hours: totals.dailyTotalHours,
      work_hours: totals.workHours,
      break_hours: totals.breakHours,
      daily_total_hours: totals.dailyTotalHours,
      activities: syncedActivities.map((row) => ({
        id: row.id,
        start_time: row.startTime,
        end_time: row.endTime,
        label: row.label,
        category: row.category,
        duration_mode: row.durationMode,
        hours: row.hours,
      })),
      breaks: (input.breaks ?? []).map((row) => ({
        id: row.id,
        start_time: row.startTime,
        end_time: row.endTime,
      })),
      notes: nullIfBlank(input.notes),
      signature_url: null,
      is_draft: false,
      status: "approved",
      submitted_at: now,
      approved_at: now,
      approved_by: approvedBy.trim(),
      overtime_hours: overtimeHours,
      myob_export_status: "not_exported",
      form_metadata: {
        submitted_by_admin: input.submittedByAdmin !== false,
        approved_by_admin: true,
      },
      updated_at: now,
    }),
    { requiredTextKeys: ["worker_id", "work_date"] }
  );
}

function buildLegacyPayload(full: Record<string, unknown>): Record<string, unknown> {
  return stripUndefined({
    worker_id: full.worker_id,
    work_date: full.work_date,
    project_id: full.project_id,
    project_name: full.project_name,
    start_time: full.start_time,
    finish_time: full.finish_time,
    break_minutes: full.break_minutes,
    total_hours: full.total_hours,
    notes: full.notes,
    status: full.status,
    approved_at: full.approved_at,
    approved_by: full.approved_by,
    submitted_at: full.submitted_at,
    updated_at: full.updated_at,
  });
}

async function resolveWorkerState(
  admin: SupabaseClient,
  workerId: string,
  providedState?: string | null
): Promise<string | null> {
  if (providedState !== undefined) {
    const normalized = normalizeWorkerStateRegion(providedState);
    return normalized ?? (providedState?.trim() || null);
  }

  const { data } = await admin
    .from("workers")
    .select("state")
    .eq("id", workerId)
    .maybeSingle();

  const state = (data as { state?: string | null } | null)?.state;
  const normalized = normalizeWorkerStateRegion(state);
  return normalized ?? (state?.trim() || null);
}

function resolveTotals(input: AdminTimesheetSubmitInput): ReturnType<typeof calculateDailyTotalsFromSlots> {
  const syncedActivities = input.activities.map(syncLineItemFields);
  const breaks = input.breaks ?? [];
  const baseTotals = calculateDailyTotalsFromSlots(syncedActivities, breaks);

  const overrideMinutes = Number(input.breakMinutes ?? 0);
  if (breaks.length === 0 && overrideMinutes > 0) {
    const breakHours = Math.round((overrideMinutes / 60) * 100) / 100;
    return {
      ...baseTotals,
      breakHours,
      dailyTotalHours: Math.max(
        0,
        Math.round((baseTotals.workHours - breakHours + baseTotals.leaveHours) * 100) / 100
      ),
    };
  }

  return baseTotals;
}

/** Insert an approved worker_timesheets row using the Supabase admin client (bypasses RLS). */
export async function submitApprovedTimesheetAdmin(
  admin: SupabaseClient,
  input: AdminTimesheetSubmitInput
): Promise<{ error: string | null; data: WorkerTimesheet | null }> {
  if (!input.workerId?.trim()) {
    return { error: "Worker is required.", data: null };
  }

  if (!input.projectId && !input.timesheetProject) {
    return { error: "Please select a project.", data: null };
  }

  const workDateError = validateTimesheetWorkDate(input.workDate);
  if (workDateError) {
    return { error: workDateError, data: null };
  }

  if (input.activities.length === 0) {
    return { error: "Add at least one daily entry.", data: null };
  }

  const syncedActivities = input.activities.map(syncLineItemFields);
  const totals = resolveTotals(input);

  if (totals.dailyTotalHours <= 0) {
    return { error: "Daily total must be greater than 0 hours.", data: null };
  }

  const workerState = await resolveWorkerState(admin, input.workerId, input.workerState);
  const actBreakError = validateActBreakRequirement({
    workerState,
    submit: true,
    breaks: input.breaks ?? [],
    breakMinutes: Math.round(totals.breakHours * 60),
    breakHours: totals.breakHours,
    notes: input.notes,
    activities: syncedActivities,
  });
  if (actBreakError) {
    return { error: actBreakError, data: null };
  }

  let projectId = input.projectId;
  let projectName = "General / Unassigned";

  if (input.timesheetProject) {
    projectId = input.timesheetProject.id;
    projectName = formatTimesheetProjectDisplayName(input.timesheetProject);
  }

  if (!projectId) {
    return { error: "Please select a project.", data: null };
  }

  if (!input.approvedBy?.trim()) {
    return { error: "Approver identity is required.", data: null };
  }

  const fullPayload = buildApprovedAdminPayload(
    { ...input, activities: syncedActivities },
    projectId,
    projectName,
    totals,
    input.approvedBy
  );

  const attempts: Record<string, unknown>[] = [fullPayload, buildLegacyPayload(fullPayload)];
  let lastError: string | null = null;

  for (const payload of attempts) {
    const { data, error } = await admin
      .from("worker_timesheets")
      .insert([payload])
      .select("*")
      .single();

    if (!error && data) {
      return { error: null, data: mapTimesheetRow(data as Record<string, unknown>) };
    }

    lastError = error?.message ?? lastError;
    if (!isSupabaseSchemaOrConstraintError(toSupabaseRequestError(error))) break;
  }

  return { error: lastError ?? "Failed to submit timesheet.", data: null };
}

export type { SaveWorkerTimesheetInput };
