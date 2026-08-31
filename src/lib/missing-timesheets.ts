import {
  fetchWorkers,
  getWorkerAssignedProjectIds,
  isSupabaseConfigured,
  isWorkerRevoked,
  supabase,
  type Worker,
} from "./supabase";
import {
  fetchProjects,
  getProjectDisplayName,
  handleSupabaseNetworkFetchError,
  type DbProject,
} from "./project-resolver";
import { getWorkerDisplayName } from "./worker-utils";
import { normalizeTimesheetStatus, toTimesheetDateKey } from "./timesheet-utils";
import {
  getPayWeekWorkingDays,
  resolvePayWeekOption,
  type PayWeekWorkingDay,
} from "./pay-week-utils";

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
  return true;
}

export function workerMatchesProjectFilter(
  worker: Worker,
  selectedProjectIds: string[],
  projects: DbProject[]
): boolean {
  const assigned = new Set(getWorkerAssignedProjectIds(worker));
  if (selectedProjectIds.length === 0) {
    return (
      assigned.size > 0 ||
      projects.some((project) =>
        (project.assigned_workers ?? []).includes(worker.id)
      )
    );
  }

  return selectedProjectIds.some((projectId) => {
    if (assigned.has(projectId)) return true;
    const project = projects.find((row) => row.id === projectId);
    return Boolean(project?.assigned_workers?.includes(worker.id));
  });
}

export function resolveWorkerProjectLabels(
  worker: Worker,
  selectedProjectIds: string[],
  projects: DbProject[]
): { projectIds: string[]; projectNames: string[] } {
  const assigned = getWorkerAssignedProjectIds(worker);
  const fromProjectLists = (projects ?? [])
    .filter((project) => (project.assigned_workers ?? []).includes(worker.id))
    .map((project) => project.id);
  const allIds = [...new Set([...assigned, ...fromProjectLists].filter(Boolean))];
  const scoped =
    selectedProjectIds.length > 0
      ? allIds.filter((id) => selectedProjectIds.includes(id))
      : allIds;

  return {
    projectIds: scoped,
    projectNames: scoped.map((id) => getProjectDisplayName(id) || id),
  };
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
  selectedProjectIds: string[],
  projects: DbProject[]
): MissingTimesheetWorkerRow {
  const { projectIds, projectNames } = resolveWorkerProjectLabels(
    worker,
    selectedProjectIds,
    projects
  );
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
    project_ids: projectIds,
    project_names: projectNames,
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
  projectIds?: string[] | null;
}): Promise<{
  rows: MissingTimesheetWorkerRow[];
  workingDays: PayWeekWorkingDay[];
  week: { startIso: string; endIso: string; label: string };
  error: string | null;
}> {
  const week = resolvePayWeekOption(options.weekStartIso);
  const workingDays = getPayWeekWorkingDays(week.startIso);
  const selectedProjectIds = (options.projectIds ?? []).map((id) => id.trim()).filter(Boolean);

  try {
    const [workers, projects, timesheets] = await Promise.all([
      fetchWorkers(),
      fetchProjects(),
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
      .filter((worker) => workerMatchesProjectFilter(worker, selectedProjectIds, projects ?? []))
      .map((worker) =>
        buildMissingTimesheetRow(
          worker,
          workingDays,
          submittedByWorker.get(worker.id) ?? new Set<string>(),
          selectedProjectIds,
          projects ?? []
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
