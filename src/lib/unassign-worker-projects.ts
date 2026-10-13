import type { SupabaseClient } from "@supabase/supabase-js";
import { dayBeforeIso } from "@/lib/project-worker-assignment-transfer";
import { formatDateOnly } from "@/lib/scheduler-utils";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export interface UnassignWorkerFromAllProjectsResult {
  ok: boolean;
  error: string | null;
  closedAssignmentCount: number;
}

type AssignmentRow = {
  id: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
};

type ScheduleRow = {
  id: string;
  start_date: string;
  end_date: string | null;
  schedule_kind?: string | null;
  leave_request_id?: string | null;
};

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function isMissingColumnError(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  const columnLower = column.toLowerCase();
  const spaced = columnLower.replace(/_/g, " ");
  return (
    (lower.includes(columnLower) || lower.includes(spaced)) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function assignmentStillActive(row: AssignmentRow, today: string): boolean {
  if (row.status === "Unassigned" && formatDateOnly(row.end_date)) {
    return formatDateOnly(row.end_date) >= today;
  }
  const end = formatDateOnly(row.end_date);
  return !end || end >= today;
}

function isLeaveSchedule(entry: ScheduleRow): boolean {
  return (
    entry.schedule_kind === "leave" ||
    Boolean(entry.leave_request_id?.trim())
  );
}

async function closeActiveAssignments(
  client: SupabaseClient,
  workerId: string,
  closeDate: string,
  today: string
): Promise<{ error: string | null; closed: number }> {
  const { data, error } = await client
    .from("project_worker_assignments")
    .select("id, start_date, end_date, status")
    .eq("worker_id", workerId);

  if (error) {
    if (isMissingTableError(error.message, "project_worker_assignments")) {
      return { error: null, closed: 0 };
    }
    if (
      isMissingColumnError(error.message, "start_date") ||
      isMissingColumnError(error.message, "end_date")
    ) {
      const { error: statusError } = await client
        .from("project_worker_assignments")
        .update({ status: "Unassigned" })
        .eq("worker_id", workerId);
      if (
        statusError &&
        !isMissingTableError(statusError.message, "project_worker_assignments")
      ) {
        return { error: statusError.message, closed: 0 };
      }
      return { error: null, closed: 0 };
    }
    return { error: error.message, closed: 0 };
  }

  const activeRows = ((data ?? []) as AssignmentRow[]).filter((row) =>
    assignmentStillActive(row, today)
  );

  let closed = 0;
  for (const row of activeRows) {
    const start = formatDateOnly(row.start_date);
    if (start && closeDate && closeDate < start) {
      const { error: deleteError } = await client
        .from("project_worker_assignments")
        .delete()
        .eq("id", row.id);
      if (deleteError) return { error: deleteError.message, closed };
      closed += 1;
      continue;
    }

    const { error: updateError } = await client
      .from("project_worker_assignments")
      .update({
        end_date: closeDate,
        status: "Unassigned",
      })
      .eq("id", row.id);

    if (updateError) {
      if (
        isMissingColumnError(updateError.message, "start_date") ||
        isMissingColumnError(updateError.message, "end_date")
      ) {
        const { error: statusError } = await client
          .from("project_worker_assignments")
          .update({ status: "Unassigned" })
          .eq("id", row.id);
        if (statusError) return { error: statusError.message, closed };
        closed += 1;
        continue;
      }
      return { error: updateError.message, closed };
    }
    closed += 1;
  }

  return { error: null, closed };
}

async function closeOpenSchedules(
  client: SupabaseClient,
  workerId: string,
  closeDate: string,
  today: string
): Promise<string | null> {
  const { data, error } = await client
    .from("worker_schedule")
    .select("id, start_date, end_date, schedule_kind, leave_request_id")
    .eq("worker_id", workerId)
    .or(`end_date.gte.${today},end_date.is.null`);

  if (error) {
    if (isMissingTableError(error.message, "worker_schedule")) return null;
    return error.message;
  }

  for (const entry of (data ?? []) as ScheduleRow[]) {
    if (isLeaveSchedule(entry)) continue;

    const start = formatDateOnly(entry.start_date);
    if (start && closeDate && closeDate < start) {
      const { error: deleteError } = await client
        .from("worker_schedule")
        .delete()
        .eq("id", entry.id);
      if (deleteError) return deleteError.message;
      continue;
    }

    const { error: updateError } = await client
      .from("worker_schedule")
      .update({ end_date: closeDate })
      .eq("id", entry.id);
    if (updateError) return updateError.message;
  }

  return null;
}

async function clearWorkerProjectFields(
  client: SupabaseClient,
  workerId: string
): Promise<string | null> {
  const payload: Record<string, unknown> = {
    assigned_project_id: null,
    assigned_project_ids: [],
    project_id: null,
    assigned_project_name: null,
    project_name: null,
  };

  const { error } = await client.from("workers").update(payload).eq("id", workerId);
  if (!error) return null;

  if (isMissingColumnError(error.message, "assigned_project_ids")) {
    const { assigned_project_ids: _ids, ...rest } = payload;
    const retry = await client.from("workers").update(rest).eq("id", workerId);
    return retry.error?.message ?? null;
  }

  return error.message;
}

export async function unassignWorkerFromAllProjects(
  workerId: string
): Promise<UnassignWorkerFromAllProjectsResult> {
  const id = workerId.trim();
  if (!id) {
    return { ok: false, error: "Worker is required.", closedAssignmentCount: 0 };
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is not configured.",
      closedAssignmentCount: 0,
    };
  }

  const today = formatDateOnly(new Date());
  const closeDate = dayBeforeIso(today);
  const admin = createSupabaseAdminClient();

  const closed = await closeActiveAssignments(admin, id, closeDate, today);
  if (closed.error) {
    return { ok: false, error: closed.error, closedAssignmentCount: closed.closed };
  }

  const scheduleError = await closeOpenSchedules(admin, id, closeDate, today);
  if (scheduleError) {
    return {
      ok: false,
      error: scheduleError,
      closedAssignmentCount: closed.closed,
    };
  }

  const workerError = await clearWorkerProjectFields(admin, id);
  if (workerError) {
    return {
      ok: false,
      error: workerError,
      closedAssignmentCount: closed.closed,
    };
  }

  return { ok: true, error: null, closedAssignmentCount: closed.closed };
}
