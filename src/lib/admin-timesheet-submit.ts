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
import { validateActBreakRequirement, resolveTimesheetBreakContext } from "./timesheet-act-break-validation";
import {
  formatTimesheetProjectDisplayName,
  type TimesheetProject,
} from "./timesheet-options";
import {
  inferCategoryFromLabel,
  syncLineItemFields,
  TIMESHEET_LINE_CATEGORY_OPTIONS,
  type TimesheetLineCategory,
} from "./timesheet-line-items";
import { mapTimesheetRow, type SaveWorkerTimesheetInput } from "./timesheet-entries";
import { resolveTimesheetOvertimeHours } from "./accounts-timesheets";
import type { WorkerTimesheet } from "./supabase";
import { isProjectUuid } from "./project-resolver";

export interface AdminTimesheetSubmitInput {
  workerId: string;
  workerName?: string | null;
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
  createdBy?: string | null;
  submittedBy?: string | null;
  approvedByName?: string | null;
  submittedByAdmin?: boolean;
}

const ALLOWED_LINE_CATEGORIES = new Set<string>(
  TIMESHEET_LINE_CATEGORY_OPTIONS.map((option) => option.value)
);

/** Map UI / short leave labels onto allowed timesheet activity categories. */
export function sanitizeTimesheetActivityCategory(
  value?: string | null
): TimesheetLineCategory {
  const trimmed = value?.trim() || "";
  if (!trimmed) return "work";
  if (ALLOWED_LINE_CATEGORIES.has(trimmed)) {
    return trimmed as TimesheetLineCategory;
  }

  const lower = trimmed.toLowerCase();
  if (lower === "annual" || lower === "annual leave") return "annual_leave";
  if (lower === "sick" || lower === "sick leave") return "sick_leave";
  if (lower === "rdo" || lower === "flexi rdo") return "rdo";
  if (
    lower === "unpaid" ||
    lower === "leave without pay" ||
    lower === "lwop"
  ) {
    return "leave_without_pay";
  }
  if (lower === "personal" || lower === "personal leave") return "personal_leave";
  if (lower === "carers" || lower === "carers leave") return "carers_leave";
  if (lower === "public holiday" || lower === "ph") return "public_holiday";
  if (lower === "wfh" || lower === "work from home") return "wfh";
  if (lower === "work" || lower === "working on site") return "work";

  return inferCategoryFromLabel(trimmed);
}

function sanitizeActivities(
  activities: TimesheetActivitySlot[]
): TimesheetActivitySlot[] {
  return activities.map((row) =>
    syncLineItemFields({
      ...row,
      id: row.id?.trim() || `activity-${row.startTime ?? "06:30"}`,
      startTime: row.startTime?.trim() || "06:30",
      endTime: row.endTime?.trim() || "14:30",
      label: row.label?.trim() || "WORKING ON SITE",
      category: sanitizeTimesheetActivityCategory(
        row.category ?? row.label ?? null
      ),
    })
  );
}

function asUuid(value: string | null | undefined): string | null {
  const trimmed = value?.trim() || "";
  return isProjectUuid(trimmed) ? trimmed : null;
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
  const syncedActivities = sanitizeActivities(input.activities);
  const firstActivity = syncedActivities[0];
  const lastActivity = syncedActivities[syncedActivities.length - 1];
  const breakMinutes = Math.round(totals.breakHours * 60);

  const rowForOvertime = {
    total_hours: totals.dailyTotalHours,
    overtime_hours: 0,
  } as WorkerTimesheet;
  const overtimeHours = resolveTimesheetOvertimeHours(rowForOvertime);

  const actorUuid =
    asUuid(input.createdBy) ?? asUuid(input.submittedBy) ?? asUuid(approvedBy);
  const workerName = input.workerName?.trim() || null;

  return sanitizeWritePayload(
    stripUndefined({
      worker_id: input.workerId?.trim() || input.workerId,
      work_date: nullIfBlankDate(input.workDate?.trim()) ?? input.workDate?.trim(),
      project_id: asUuid(projectId),
      project_name: projectName?.trim() || projectName,
      worker_trade:
        input.workerTrade?.trim() || input.timesheetTaskName?.trim() || null,
      start_time: firstActivity?.startTime?.trim() || "06:30",
      finish_time: lastActivity?.endTime?.trim() || "14:30",
      break_minutes: breakMinutes,
      total_hours: totals.dailyTotalHours,
      work_hours: totals.workHours,
      break_hours: totals.breakHours,
      daily_total_hours: totals.dailyTotalHours,
      activities: syncedActivities.map((row) => ({
        id: row.id?.trim() || `activity-${row.startTime}`,
        start_time: row.startTime?.trim() || "06:30",
        end_time: row.endTime?.trim() || "14:30",
        label: row.label?.trim() || null,
        category: sanitizeTimesheetActivityCategory(row.category),
        duration_mode: row.durationMode ?? null,
        hours: row.hours,
      })),
      breaks: (input.breaks ?? []).map((row) => ({
        id: row.id?.trim() || `break-${row.startTime}`,
        start_time: row.startTime?.trim() || null,
        end_time: row.endTime?.trim() || null,
      })),
      notes: nullIfBlank(input.notes?.trim() ?? input.notes),
      signature_url: null,
      is_draft: false,
      status: "approved",
      submitted_at: now,
      approved_at: now,
      approved_by: actorUuid,
      overtime_hours: overtimeHours,
      myob_export_status: "not_exported",
      form_metadata: {
        submitted_by_admin: input.submittedByAdmin !== false,
        approved_by_admin: true,
        approved_by_name: input.approvedByName?.trim() || null,
        worker_name: workerName,
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

function resolveTotals(input: AdminTimesheetSubmitInput): ReturnType<typeof calculateDailyTotalsFromSlots> {
  const syncedActivities = sanitizeActivities(input.activities);
  const breaks = input.breaks ?? [];
  const baseTotals = calculateDailyTotalsFromSlots(syncedActivities, breaks);

  const overrideMinutes = Number(input.breakMinutes ?? 0);
  if (breaks.length === 0 && overrideMinutes > 0) {
    const breakHours = Math.round((overrideMinutes / 60) * 100) / 100;
    const grossWorkHours = baseTotals.grossWorkHours;
    const workHours = Math.max(
      0,
      Math.round((grossWorkHours - breakHours) * 100) / 100
    );
    return {
      ...baseTotals,
      breakHours,
      workHours,
      grossWorkHours,
      dailyTotalHours: Math.max(
        0,
        Math.round((grossWorkHours + baseTotals.leaveHours) * 100) / 100
      ),
    };
  }

  return baseTotals;
}

async function buildValidatedPayload(
  admin: SupabaseClient,
  input: AdminTimesheetSubmitInput
): Promise<{ error: string | null; payload: Record<string, unknown> | null }> {
  if (!asUuid(input.workerId)) {
    return { error: "Worker is required.", payload: null };
  }

  if (!input.projectId && !input.timesheetProject) {
    return { error: "Please select a project.", payload: null };
  }

  const workDateError = validateTimesheetWorkDate(input.workDate?.trim() || "");
  if (workDateError) {
    return { error: workDateError, payload: null };
  }

  const syncedActivities = sanitizeActivities(input.activities);
  if (syncedActivities.length === 0) {
    return { error: "Add at least one daily entry.", payload: null };
  }

  const totals = resolveTotals({ ...input, activities: syncedActivities });
  if (totals.dailyTotalHours <= 0) {
    return { error: "Daily total must be greater than 0 hours.", payload: null };
  }

  const { workerState, payRuleName } = await resolveTimesheetBreakContext(
    admin,
    input.workerId,
    input.workerState
  );
  const actBreakError = validateActBreakRequirement({
    workerState,
    payRuleName,
    submit: true,
    breaks: input.breaks ?? [],
    breakMinutes: Math.round(totals.breakHours * 60) || 0,
    breakHours: totals.breakHours || 0,
    notes: input.notes,
    activities: syncedActivities,
    startTime: syncedActivities[0]?.startTime,
    endTime: syncedActivities[syncedActivities.length - 1]?.endTime,
  });
  if (actBreakError) {
    return { error: actBreakError, payload: null };
  }

  let projectId = asUuid(input.projectId);
  let projectName = "General / Unassigned";

  if (input.timesheetProject) {
    projectId = asUuid(input.timesheetProject.id) ?? projectId;
    projectName = formatTimesheetProjectDisplayName(input.timesheetProject);
  }

  if (!projectId) {
    return { error: "Please select a project.", payload: null };
  }

  const actorUuid =
    asUuid(input.createdBy) ?? asUuid(input.submittedBy) ?? asUuid(input.approvedBy);
  if (!actorUuid) {
    return { error: "Approver identity is required.", payload: null };
  }

  return {
    error: null,
    payload: buildApprovedAdminPayload(
      { ...input, activities: syncedActivities },
      projectId,
      projectName,
      totals,
      actorUuid
    ),
  };
}

/**
 * Insert one or more approved worker_timesheets rows in a single Supabase insert.
 * Used for dual-entry Accounts submissions (work + leave on the same day).
 */
export async function submitApprovedTimesheetsAdmin(
  admin: SupabaseClient,
  inputs: AdminTimesheetSubmitInput[]
): Promise<{ error: string | null; data: WorkerTimesheet[] }> {
  const source = Array.isArray(inputs) ? inputs.filter(Boolean) : [];
  if (source.length === 0) {
    return { error: "Add at least one daily entry.", data: [] };
  }

  const payloads: Record<string, unknown>[] = [];
  for (const input of source) {
    const validated = await buildValidatedPayload(admin, input);
    if (validated.error || !validated.payload) {
      return { error: validated.error ?? "Failed to build timesheet payload.", data: [] };
    }
    payloads.push(validated.payload);
  }

  const attempts: Record<string, unknown>[][] = [
    payloads,
    payloads.map(buildLegacyPayload),
  ];
  let lastError: string | null = null;

  for (const attempt of attempts) {
    const { data, error } = await admin
      .from("worker_timesheets")
      .insert(attempt)
      .select("*");

    if (!error && data) {
      return {
        error: null,
        data: (data as Record<string, unknown>[]).map(mapTimesheetRow),
      };
    }

    lastError = error?.message ?? lastError;
    if (!isSupabaseSchemaOrConstraintError(toSupabaseRequestError(error))) break;
  }

  return { error: lastError ?? "Failed to submit timesheet.", data: [] };
}

/** Insert an approved worker_timesheets row using the Supabase admin client (bypasses RLS). */
export async function submitApprovedTimesheetAdmin(
  admin: SupabaseClient,
  input: AdminTimesheetSubmitInput
): Promise<{ error: string | null; data: WorkerTimesheet | null }> {
  const result = await submitApprovedTimesheetsAdmin(admin, [input]);
  return {
    error: result.error,
    data: result.data[0] ?? null,
  };
}

export type { SaveWorkerTimesheetInput };
