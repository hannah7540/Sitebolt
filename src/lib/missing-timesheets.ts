import {
  fetchWorkers,
  isSupabaseConfigured,
  isWorkerRevoked,
  supabase,
  type Worker,
} from "./supabase";
import {
  fetchProjectWorkerAssignments,
  type ProjectWorkerAssignment,
} from "./project-assignments";
import { getProjectDisplayName, handleSupabaseNetworkFetchError } from "./project-resolver";
import { formatDateOnly } from "./scheduler-utils";
import { getWorkerDisplayName } from "./worker-utils";
import { normalizeTimesheetStatus, toTimesheetDateKey } from "./timesheet-utils";
import {
  getPayWeekWorkingDays,
  resolvePayWeekOption,
  type PayWeekWorkingDay,
} from "./pay-week-utils";
import { normalizeWorkerStateRegion } from "./worker-state-region";
import {
  isExcludedAccountEmail,
  MISSING_TIMESHEET_EXCLUDED_EMAILS,
} from "./operational-account-exclusions";

export const MISSING_TIMESHEET_STATE_OPTIONS = ["ACT", "NSW", "WA", "NZ"] as const;
export type MissingTimesheetState = (typeof MISSING_TIMESHEET_STATE_OPTIONS)[number];

export type MissingTimesheetDayStatus = "submitted" | "missing";

export interface MissingTimesheetDayCell {
  iso: string;
  shortLabel: string;
  fullLabel: string;
  status: MissingTimesheetDayStatus;
}

export interface MissingTimesheetWorkerRow {
  worker_id: string;
  worker_name: string;
  worker_trade: string | null;
  photo_url: string | null;
  project_ids: string[];
  project_names: string[];
  days: MissingTimesheetDayCell[];
  missing_days: string[];
  missing_day_names: string[];
  is_complete: boolean;
}

export interface TimesheetReminderRecord {
  id: string;
  worker_id: string;
  missing_days: string[];
  pay_week_start: string | null;
  pay_week_end: string | null;
  message_body: string | null;
  sent_at: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function isSubmittedTimesheet(row: unknown): boolean {
  const record = asRecord(row);
  if (!record) return false;
  if (record.is_draft === true) return false;
  const status = normalizeTimesheetStatus(
    typeof record.status === "string" ? record.status : null
  );
  if (status === "pending" || status === "approved" || status === "rejected") {
    return true;
  }
  return Boolean(record.submitted_at);
}

export function isActiveTimesheetWorker(worker: Worker | null | undefined): boolean {
  if (!worker?.id) return false;
  if (isWorkerRevoked(worker)) return false;
  if (worker.is_archived === true) return false;
  if (String(worker.worker_category ?? "").trim().toLowerCase() === "hired_labour") {
    return false;
  }
  if (isExcludedAccountEmail(worker.email, MISSING_TIMESHEET_EXCLUDED_EMAILS)) {
    return false;
  }
  return true;
}

export function workerMatchesStateFilter(
  worker: Worker,
  selectedState: string | null | undefined
): boolean {
  if (!selectedState) return true;
  return normalizeWorkerStateRegion(worker.state) === selectedState;
}

/** Current permanent assignment: already started and still open-ended. */
export function isCurrentOpenProjectAssignment(
  row: ProjectWorkerAssignment,
  onDate: string = formatDateOnly(new Date())
): boolean {
  if (row.status === "Transferred" || row.status === "Unassigned") return false;
  const start = formatDateOnly(row.start_date);
  const end = formatDateOnly(row.end_date);
  if (end) return false;
  if (start && start > onDate) return false;
  return true;
}

export function resolveCurrentActiveProject(
  worker: Worker,
  assignments: ProjectWorkerAssignment[]
): { projectId: string | null; projectName: string | null } {
  const today = formatDateOnly(new Date());
  const open = assignments
    .filter((row) => row.worker_id === worker.id && isCurrentOpenProjectAssignment(row, today))
    .sort((left, right) =>
      formatDateOnly(right.start_date).localeCompare(formatDateOnly(left.start_date))
    );

  const current = open[0];
  if (!current?.project_id) {
    return { projectId: null, projectName: null };
  }

  const name =
    current.project_name?.trim() ||
    getProjectDisplayName(current.project_id) ||
    current.project_id;

  return { projectId: current.project_id, projectName: name };
}

export function buildMissingTimesheetReminderMessage(
  missingDayNames: string[]
): string {
  const days = (missingDayNames ?? []).map((name) => name.trim()).filter(Boolean);
  return `Please submit missing timesheet for ${days.join(", ")}`;
}

export function buildMissingTimesheetRow(
  worker: Worker,
  workingDays: PayWeekWorkingDay[],
  submittedDates: Set<string>,
  assignments: ProjectWorkerAssignment[]
): MissingTimesheetWorkerRow {
  const { projectId, projectName } = resolveCurrentActiveProject(worker, assignments);
  const days: MissingTimesheetDayCell[] = (workingDays ?? []).map((day) => {
    const submitted = submittedDates.has(day.iso);
    return {
      iso: day.iso,
      shortLabel: day.shortLabel,
      fullLabel: day.fullLabel,
      status: submitted ? "submitted" : "missing",
    };
  });
  const missing = days.filter((day) => day.status === "missing");

  return {
    worker_id: worker.id,
    worker_name: getWorkerDisplayName(worker, "Unknown worker"),
    worker_trade: worker.trade?.trim() || worker.worker_type?.trim() || null,
    photo_url: worker.photo_url ?? null,
    project_ids: projectId ? [projectId] : [],
    project_names: projectName ? [projectName] : [],
    days,
    missing_days: missing.map((day) => day.iso),
    missing_day_names: missing.map((day) => day.fullLabel),
    is_complete: missing.length === 0,
  };
}

async function fetchTimesheetsForPayWeek(
  startIso: string,
  endIso: string
): Promise<Array<{ worker_id: string; work_date: string; status?: string | null; is_draft?: boolean; submitted_at?: string | null }>> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabase
      .from("worker_timesheets")
      .select("id, worker_id, work_date, status, is_draft, submitted_at")
      .gte("work_date", startIso)
      .lte("work_date", endIso);

    if (error) {
      if (handleSupabaseNetworkFetchError(error, "fetch missing timesheets")) {
        return [];
      }
      console.warn("fetchTimesheetsForPayWeek failed:", error.message);
      return [];
    }

    return (data ?? [])
      .map((row) => asRecord(row))
      .filter((row): row is Record<string, unknown> => Boolean(row))
      .map((row) => ({
        worker_id: String(row.worker_id ?? ""),
        work_date: toTimesheetDateKey(String(row.work_date ?? "")),
        status: typeof row.status === "string" ? row.status : null,
        is_draft: row.is_draft === true,
        submitted_at: typeof row.submitted_at === "string" ? row.submitted_at : null,
      }))
      .filter((row) => row.worker_id && row.work_date && isSubmittedTimesheet(row));
  } catch (error) {
    if (handleSupabaseNetworkFetchError(error, "fetch missing timesheets")) {
      return [];
    }
    console.warn("fetchTimesheetsForPayWeek threw:", error);
    return [];
  }
}

export async function fetchMissingTimesheetSearch(options: {
  weekStartIso: string;
  state?: string | null;
}): Promise<{
  rows: MissingTimesheetWorkerRow[];
  workingDays: PayWeekWorkingDay[];
  week: { startIso: string; endIso: string; label: string };
  error: string | null;
}> {
  const week = resolvePayWeekOption(options.weekStartIso);
  const workingDays = getPayWeekWorkingDays(week.startIso);
  const selectedState = normalizeWorkerStateRegion(options.state);

  try {
    const [workers, assignments, timesheets] = await Promise.all([
      fetchWorkers({ excludeEmails: MISSING_TIMESHEET_EXCLUDED_EMAILS }),
      fetchProjectWorkerAssignments(),
      fetchTimesheetsForPayWeek(week.startIso, week.endIso),
    ]);

    const submittedByWorker = new Map<string, Set<string>>();
    for (const timesheet of timesheets ?? []) {
      if (!timesheet?.worker_id || !timesheet.work_date) continue;
      const dates = submittedByWorker.get(timesheet.worker_id) ?? new Set<string>();
      dates.add(timesheet.work_date);
      submittedByWorker.set(timesheet.worker_id, dates);
    }

    const rows = (workers ?? [])
      .filter((worker) => isActiveTimesheetWorker(worker))
      .filter((worker) => workerMatchesStateFilter(worker, selectedState))
      .map((worker) =>
        buildMissingTimesheetRow(
          worker,
          workingDays,
          submittedByWorker.get(worker.id) ?? new Set<string>(),
          assignments ?? []
        )
      )
      .sort((left, right) => left.worker_name.localeCompare(right.worker_name));

    return { rows, workingDays, week, error: null };
  } catch (error) {
    return {
      rows: [],
      workingDays,
      week,
      error: error instanceof Error ? error.message : "Failed to load missing timesheets.",
    };
  }
}

export async function recordTimesheetReminder(input: {
  workerId: string;
  missingDays: string[];
  payWeekStart?: string | null;
  payWeekEnd?: string | null;
  messageBody?: string | null;
  projectIds?: string[] | null;
  sentBy?: string | null;
}): Promise<{ error: string | null; reminder?: TimesheetReminderRecord }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured" };
  }

  const payload = {
    worker_id: input.workerId,
    missing_days: (input.missingDays ?? []).filter(Boolean),
    pay_week_start: input.payWeekStart || null,
    pay_week_end: input.payWeekEnd || null,
    message_body: input.messageBody?.trim() || null,
    project_ids: (input.projectIds ?? []).filter(Boolean),
    sent_by: input.sentBy || null,
  };

  try {
    const { data, error } = await supabase
      .from("timesheet_reminders")
      .insert(payload)
      .select("id, worker_id, missing_days, pay_week_start, pay_week_end, message_body, sent_at")
      .single();

    if (error) {
      const { sent_by: _removed, ...withoutSender } = payload;
      const retry = await supabase
        .from("timesheet_reminders")
        .insert(withoutSender)
        .select("id, worker_id, missing_days, pay_week_start, pay_week_end, message_body, sent_at")
        .single();
      if (retry.error || !retry.data) {
        return { error: retry.error?.message ?? error.message };
      }
      return { error: null, reminder: retry.data as TimesheetReminderRecord };
    }

    return { error: null, reminder: data as TimesheetReminderRecord };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to record reminder.",
    };
  }
}
