import { supabase, isSupabaseConfigured } from "./supabase";
import { normalizeLeaveTypeLabel } from "./leave-type-calendar";
import {
  fetchWorkerLeavePayRuleCondition,
  formatLeavePayRuleNoteSuffix,
} from "./pay-rule-templates";
import { getProjectDisplayName } from "./project-resolver";
import {
  formatDateOnly,
  getCalendarDaysInRange,
} from "./scheduler-utils";
import { isSupabaseMissingColumnError } from "./supabase-errors";
import {
  isZeroHourLeaveType,
  resolveLeaveTimesheetDaySpec,
} from "./leave-timesheet-rules";

export interface GenerateLeaveTimesheetsInput {
  leaveRequestId: string;
  workerId: string;
  startDate: string;
  endDate: string;
  leaveType?: string | null;
  projectId?: string | null;
}

export function formatLeaveTimesheetApprovalToast(
  generatedCount: number,
  leaveType?: string | null
): string {
  if (generatedCount === 0) {
    return "Leave approved. No new timesheet rows were needed.";
  }

  const normalized = normalizeLeaveTypeLabel(leaveType);
  if (isZeroHourLeaveType(normalized)) {
    return `Leave approved and ${generatedCount} pending timesheet row(s) created (${normalized}, 0.0 hrs).`;
  }

  return `Leave approved and timesheets generated for ${generatedCount} day(s) in the leave range.`;
}

function stripNullishFields(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined && value !== null) next[key] = value;
  }
  return next;
}

function omitFields(
  row: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  const next = { ...row };
  for (const key of keys) delete next[key];
  return next;
}

async function insertLeaveTimesheetRow(
  payloads: Record<string, unknown>[]
): Promise<boolean> {
  for (const payload of payloads) {
    const { error } = await supabase.from("worker_timesheets").insert([payload]);
    if (!error) return true;
    if (!isSupabaseMissingColumnError(error)) {
      console.warn("[leave-timesheets] Insert failed:", error.message);
      return false;
    }
  }
  return false;
}

/** Create leave-driven timesheet rows for each day in an approved leave range. */
export async function generateTimesheetsForApprovedLeave(
  input: GenerateLeaveTimesheetsInput
): Promise<{ generated: number; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { generated: 0, error: null };
  }

  const startDate = formatDateOnly(input.startDate);
  const endDate = formatDateOnly(input.endDate);
  if (!startDate || !endDate || endDate < startDate) {
    return { generated: 0, error: null };
  }

  const leaveType = normalizeLeaveTypeLabel(input.leaveType);
  const payRuleMatch = await fetchWorkerLeavePayRuleCondition(
    input.workerId,
    leaveType
  );
  const payRuleSuffix = payRuleMatch.condition
    ? formatLeavePayRuleNoteSuffix({
        conditionName: payRuleMatch.condition.condition_name,
        templateName: payRuleMatch.templateName,
      })
    : "";
  const notes = `${leaveType}${payRuleSuffix} - Auto-generated from approved leave request`;
  const projectId = input.projectId?.trim() || null;
  const projectName = projectId ? getProjectDisplayName(projectId) : null;
  const calendarDays = getCalendarDaysInRange(
    new Date(`${startDate}T12:00:00`),
    new Date(`${endDate}T12:00:00`)
  );

  if (calendarDays.length === 0) {
    return { generated: 0, error: null };
  }

  const { data: existingRows, error: fetchError } = await supabase
    .from("worker_timesheets")
    .select("work_date")
    .eq("worker_id", input.workerId)
    .gte("work_date", startDate)
    .lte("work_date", endDate);

  if (fetchError) {
    console.warn("[leave-timesheets] Existing timesheet lookup failed:", fetchError.message);
    return { generated: 0, error: fetchError.message };
  }

  const existingDates = new Set(
    (existingRows ?? []).map((row) => formatDateOnly(String(row.work_date)))
  );

  const now = new Date().toISOString();
  let generated = 0;

  for (const day of calendarDays) {
    if (existingDates.has(day.iso)) continue;

    const daySpec = resolveLeaveTimesheetDaySpec(leaveType, day.iso);

    const fullPayload = stripNullishFields({
      worker_id: input.workerId,
      work_date: day.iso,
      project_id: projectId,
      project_name: projectName,
      start_time: daySpec.startTime,
      finish_time: daySpec.finishTime,
      break_minutes: 0,
      total_hours: daySpec.totalHours,
      work_hours: daySpec.workHours,
      daily_total_hours: daySpec.totalHours,
      activities: daySpec.activities,
      breaks: [],
      notes,
      status: "pending",
      is_draft: false,
      submitted_at: now,
      leave_request_id: input.leaveRequestId,
      updated_at: now,
    });

    const withoutLeaveRequestId = omitFields(fullPayload, ["leave_request_id"]);
    const legacyPayload = stripNullishFields({
      worker_id: input.workerId,
      work_date: day.iso,
      project_id: projectId,
      project_name: projectName,
      start_time: daySpec.startTime,
      finish_time: daySpec.finishTime,
      break_minutes: 0,
      total_hours: daySpec.totalHours,
      notes,
      status: "pending",
      updated_at: now,
    });

    const inserted = await insertLeaveTimesheetRow([
      fullPayload,
      withoutLeaveRequestId,
      legacyPayload,
    ]);

    if (inserted) {
      generated += 1;
      existingDates.add(day.iso);
    }
  }

  return { generated, error: null };
}
