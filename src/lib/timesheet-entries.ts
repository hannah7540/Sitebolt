import {
  supabase,
  isSupabaseConfigured,
  type WorkerTimesheet,
  type TimesheetStatus,
} from "./supabase";
import { getProjectDisplayName, isProjectUuid, resolveProjectId } from "./project-resolver";
import {
  isSupabaseSchemaOrConstraintError,
  toSupabaseRequestError,
} from "./supabase-errors";
import {
  calculateDailyTotalsFromSlots,
  isTimesheetPending,
  normalizeTimesheetStatus,
  validateTimesheetWorkDate,
  type TimesheetActivitySlot,
  type TimesheetBreakSlot,
} from "./timesheet-utils";
import {
  validateActBreakRequirement,
} from "./timesheet-act-break-validation";
import { normalizeWorkerStateRegion } from "./worker-state-region";
import {
  formatTimesheetProjectDisplayName,
  type TimesheetProject,
} from "./timesheet-options";
import {
  migrateActivityToLineItem,
  syncLineItemFields,
} from "./timesheet-line-items";

export type { TimesheetActivitySlot, TimesheetBreakSlot };

export interface SaveWorkerTimesheetInput {
  workerId: string;
  workDate: string;
  projectId: string | null;
  timesheetProject?: TimesheetProject | null;
  timesheetTaskName?: string | null;
  workerTrade?: string | null;
  activities: TimesheetActivitySlot[];
  breaks: TimesheetBreakSlot[];
  notes?: string | null;
  signatureDataUrl?: string | null;
  signatureUrl?: string | null;
  submit?: boolean;
  existingId?: string | null;
  workerState?: string | null;
}

function stripUndefined(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

function normalizeActivities(raw: unknown): TimesheetActivitySlot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const startTime = String(row.start_time ?? row.startTime ?? "06:30").slice(0, 5);
      const endTime = String(row.end_time ?? row.endTime ?? "14:30").slice(0, 5);
      const category = row.category ?? row.category;
      const durationMode = row.duration_mode ?? row.durationMode;
      const hours =
        row.hours != null && Number.isFinite(Number(row.hours))
          ? Number(row.hours)
          : null;

      return migrateActivityToLineItem({
        id: String(row.id ?? `activity-${startTime}`),
        startTime,
        endTime,
        label: String(row.label ?? "WORKING ON SITE").trim() || "WORKING ON SITE",
        category: category as TimesheetActivitySlot["category"],
        durationMode: durationMode as TimesheetActivitySlot["durationMode"],
        hours,
      });
    })
    .filter((item): item is TimesheetActivitySlot => item !== null);
}

function normalizeBreaks(raw: unknown): TimesheetBreakSlot[] {
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

export function mapTimesheetRow(row: Record<string, unknown>): WorkerTimesheet {
  const activities = normalizeActivities(row.activities);
  const breaks = normalizeBreaks(row.breaks);
  const firstActivity = activities[0];
  const lastActivity = activities[activities.length - 1];

  return {
    id: String(row.id),
    worker_id: String(row.worker_id),
    work_date: String(row.work_date),
    project_id: row.project_id ? String(row.project_id) : null,
    project_name: row.project_name ? String(row.project_name) : null,
    worker_trade: row.worker_trade ? String(row.worker_trade) : null,
    start_time: String(row.start_time ?? firstActivity?.startTime ?? "06:30").slice(0, 5),
    finish_time: String(row.finish_time ?? lastActivity?.endTime ?? "14:30").slice(0, 5),
    break_minutes: Number(row.break_minutes ?? 0) || 0,
    total_hours: Number(row.daily_total_hours ?? row.total_hours ?? 0) || 0,
    work_hours: row.work_hours != null ? Number(row.work_hours) : null,
    break_hours: row.break_hours != null ? Number(row.break_hours) : null,
    daily_total_hours:
      row.daily_total_hours != null
        ? Number(row.daily_total_hours)
        : Number(row.total_hours ?? 0) || 0,
    activities,
    breaks,
    signature_url: row.signature_url ? String(row.signature_url) : null,
    is_draft: Boolean(row.is_draft),
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    overtime_hours: row.overtime_hours != null ? Number(row.overtime_hours) : undefined,
    notes: row.notes ? String(row.notes) : null,
    status: normalizeTimesheetStatus(
      row.status != null ? String(row.status) : "pending"
    ),
    myob_export_status: row.myob_export_status as WorkerTimesheet["myob_export_status"],
    myob_exported_at: row.myob_exported_at ? String(row.myob_exported_at) : null,
    approved_at: row.approved_at ? String(row.approved_at) : null,
    leave_request_id: row.leave_request_id ? String(row.leave_request_id) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function buildPayload(
  input: SaveWorkerTimesheetInput,
  projectId: string,
  projectName: string,
  totals: ReturnType<typeof calculateDailyTotalsFromSlots>,
  signatureUrl: string | null
): Record<string, unknown> {
  const now = new Date().toISOString();
  const firstActivity = input.activities[0];
  const lastActivity = input.activities[input.activities.length - 1];
  const isDraft = !input.submit;
  const status = input.submit ? "pending" : "draft";

  return stripUndefined({
    worker_id: input.workerId,
    work_date: input.workDate,
    project_id: projectId,
    project_name: projectName,
    worker_trade: input.workerTrade?.trim() || null,
    start_time: firstActivity?.startTime ?? "06:30",
    finish_time: lastActivity?.endTime ?? "14:30",
    break_minutes: Math.round(totals.breakHours * 60),
    total_hours: totals.dailyTotalHours,
    work_hours: totals.workHours,
    break_hours: totals.breakHours,
    daily_total_hours: totals.dailyTotalHours,
    activities: input.activities.map((row) => {
      const synced = syncLineItemFields(row);
      return {
        id: synced.id,
        start_time: synced.startTime,
        end_time: synced.endTime,
        label: synced.label,
        category: synced.category,
        duration_mode: synced.durationMode,
        hours: synced.hours,
      };
    }),
    breaks: input.breaks.map((row) => ({
      id: row.id,
      start_time: row.startTime,
      end_time: row.endTime,
    })),
    notes: input.notes?.trim() || null,
    signature_url: input.submit ? signatureUrl : signatureUrl || null,
    is_draft: isDraft,
    status,
    submitted_at: input.submit ? now : null,
    updated_at: now,
  });
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
    updated_at: full.updated_at,
  });
}

async function resolveWorkerStateForTimesheet(
  workerId: string,
  providedState?: string | null
): Promise<string | null> {
  if (providedState !== undefined) {
    const normalized = normalizeWorkerStateRegion(providedState);
    return normalized ?? (providedState?.trim() || null);
  }

  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from("workers")
    .select("state")
    .eq("id", workerId)
    .maybeSingle();

  if (error || !data) return null;
  const state = (data as { state?: string | null }).state;
  const normalized = normalizeWorkerStateRegion(state);
  return normalized ?? (state?.trim() || null);
}

export async function saveWorkerTimesheetEntry(
  input: SaveWorkerTimesheetInput
): Promise<{ error: string | null; data: WorkerTimesheet | null }> {
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
  const totals = calculateDailyTotalsFromSlots(syncedActivities, input.breaks);

  if (input.submit) {
    const workerState = await resolveWorkerStateForTimesheet(
      input.workerId,
      input.workerState
    );
    const actBreakError = validateActBreakRequirement({
      workerState,
      submit: true,
      breaks: input.breaks,
      breakMinutes: Math.round(totals.breakHours * 60),
      breakHours: totals.breakHours,
      notes: input.notes,
      activities: syncedActivities,
    });
    if (actBreakError) {
      return { error: actBreakError, data: null };
    }
  }

  if (totals.dailyTotalHours <= 0 && input.submit) {
    return { error: "Daily total must be greater than 0 hours.", data: null };
  }

  if (input.submit && !input.signatureDataUrl?.trim() && !input.signatureUrl?.trim()) {
    return { error: "Signature is required to submit.", data: null };
  }

  let projectId = input.projectId;
  let projectName = "General / Unassigned";

  if (input.timesheetProject) {
    projectId = input.timesheetProject.id;
    projectName = formatTimesheetProjectDisplayName(input.timesheetProject);
  } else if (projectId) {
    if (!isProjectUuid(projectId)) {
      const resolved = await resolveProjectId(projectId);
      if (resolved.error || !resolved.id) {
        return { error: resolved.error ?? "Invalid project selected.", data: null };
      }
      projectId = resolved.id;
    }
    projectName = getProjectDisplayName(projectId) || projectName;
  }

  if (!projectId) {
    return { error: "Please select a project.", data: null };
  }
  let signatureUrl = input.signatureUrl?.trim() || null;

  if (input.signatureDataUrl?.trim()) {
    const { uploadWorkerSignature } = await import("./worker-doc-upload");
    signatureUrl =
      (await uploadWorkerSignature(
        input.signatureDataUrl,
        `timesheets/${input.workerId}/${input.workDate}-${Date.now()}.png`
      )) || input.signatureDataUrl.trim();
  }

  const fullPayload = buildPayload(
    {
      ...input,
      activities: syncedActivities,
      workerTrade: input.timesheetTaskName?.trim() || input.workerTrade,
    },
    projectId,
    projectName,
    totals,
    signatureUrl
  );

  if (!isSupabaseConfigured()) {
    return {
      error: "Timesheets require Supabase configuration.",
      data: mapTimesheetRow({ id: `local-${Date.now()}`, ...fullPayload }),
    };
  }

  const attempts: Record<string, unknown>[] = input.existingId
    ? [fullPayload]
    : [fullPayload, buildLegacyPayload(fullPayload)];

  let lastError: string | null = null;

  for (const payload of attempts) {
    if (input.existingId) {
      const { data, error } = await supabase
        .from("worker_timesheets")
        .update(payload)
        .eq("id", input.existingId)
        .select("*")
        .single();

      if (!error && data) {
        return { error: null, data: mapTimesheetRow(data as Record<string, unknown>) };
      }

      lastError = error?.message ?? lastError;
      if (!isSupabaseSchemaOrConstraintError(toSupabaseRequestError(error))) break;
      continue;
    }

    const { data, error } = await supabase
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

  return { error: lastError ?? "Failed to save timesheet.", data: null };
}

export function sumPayWeekDailyHours(
  timesheets: WorkerTimesheet[],
  startIso: string,
  endIso: string
): number {
  return timesheets
    .filter((row) => row.work_date >= startIso && row.work_date <= endIso)
    .reduce(
      (sum, row) =>
        sum + Number(row.daily_total_hours ?? row.total_hours ?? 0),
      0
    );
}

export function getTodayTimesheetEntry(
  timesheets: WorkerTimesheet[],
  workDate: string
): WorkerTimesheet | null {
  return (
    timesheets.find(
      (row) =>
        row.work_date === workDate &&
        (row.is_draft || isTimesheetPending(row.status))
    ) ?? null
  );
}
