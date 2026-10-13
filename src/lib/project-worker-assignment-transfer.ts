import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateOnly } from "@/lib/scheduler-utils";

export interface PermanentProjectAssignmentTransferInput {
  workerId: string;
  projectId: string;
  projectName: string;
  workerName?: string | null;
  effectiveFrom: string;
}

type AssignmentRow = {
  id: string;
  project_id: string;
  worker_id: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
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

function isUniqueViolation(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("duplicate key") ||
    lower.includes("unique constraint") ||
    lower.includes("project_worker_assignments_active_unique") ||
    lower.includes("project_id_worker_id")
  );
}

export function dayBeforeIso(isoDate: string): string {
  const normalized = formatDateOnly(isoDate);
  const date = new Date(`${normalized}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return formatDateOnly(date);
}

function isOpenAssignment(row: AssignmentRow): boolean {
  if (row.status === "Transferred" || row.status === "Unassigned") {
    return !formatDateOnly(row.end_date);
  }
  return !formatDateOnly(row.end_date);
}

/**
 * Close the worker's current open project assignment the day before
 * `effectiveFrom`, then insert an open-ended row for the new project.
 */
export async function applyPermanentProjectAssignmentTransfer(
  client: SupabaseClient,
  input: PermanentProjectAssignmentTransferInput
): Promise<string | null> {
  const workerId = input.workerId.trim();
  const projectId = input.projectId.trim();
  const projectName = input.projectName.trim();
  const effectiveFrom = formatDateOnly(input.effectiveFrom);
  const workerName = input.workerName?.trim() || null;

  if (!workerId || !projectId || !effectiveFrom) {
    return "Worker, project, and effective from date are required.";
  }

  const priorEnd = dayBeforeIso(effectiveFrom);

  const { data, error } = await client
    .from("project_worker_assignments")
    .select("id, project_id, worker_id, start_date, end_date, status")
    .eq("worker_id", workerId);

  if (error) {
    if (isMissingTableError(error.message, "project_worker_assignments")) {
      return null;
    }
    if (
      isMissingColumnError(error.message, "start_date") ||
      isMissingColumnError(error.message, "end_date")
    ) {
      return applyLegacyStatusTransfer(client, {
        workerId,
        projectId,
        projectName,
        workerName,
      });
    }
    return error.message;
  }

  const rows = (data ?? []) as AssignmentRow[];
  const openRows = rows.filter(isOpenAssignment);

  for (const row of openRows) {
    if (row.project_id === projectId) {
      continue;
    }

    const start = formatDateOnly(row.start_date);
    if (start && priorEnd && priorEnd < start) {
      const { error: deleteError } = await client
        .from("project_worker_assignments")
        .delete()
        .eq("id", row.id);
      if (deleteError) return deleteError.message;
      continue;
    }

    const { error: updateError } = await client
      .from("project_worker_assignments")
      .update({
        end_date: priorEnd,
        status: "Transferred",
      })
      .eq("id", row.id);

    if (updateError) {
      if (
        isMissingColumnError(updateError.message, "start_date") ||
        isMissingColumnError(updateError.message, "end_date")
      ) {
        const { error: statusError } = await client
          .from("project_worker_assignments")
          .update({ status: "Transferred" })
          .eq("id", row.id);
        if (statusError) return statusError.message;
        continue;
      }
      return updateError.message;
    }
  }

  const existingOpenOnTarget = openRows.find((row) => row.project_id === projectId);
  if (existingOpenOnTarget) {
    const { error: keepError } = await client
      .from("project_worker_assignments")
      .update({
        status: "Active",
        project_name: projectName || undefined,
        worker_name: workerName || undefined,
        start_date: formatDateOnly(existingOpenOnTarget.start_date) || effectiveFrom,
        end_date: null,
      })
      .eq("id", existingOpenOnTarget.id);

    if (
      keepError &&
      !isMissingColumnError(keepError.message, "start_date") &&
      !isMissingColumnError(keepError.message, "end_date")
    ) {
      return keepError.message;
    }
    return null;
  }

  const insertPayload: Record<string, unknown> = {
    worker_id: workerId,
    project_id: projectId,
    project_name: projectName || null,
    worker_name: workerName,
    status: "Active",
    start_date: effectiveFrom,
    end_date: null,
  };

  const { error: insertError } = await client
    .from("project_worker_assignments")
    .insert([insertPayload]);

  if (!insertError) return null;

  if (isMissingTableError(insertError.message, "project_worker_assignments")) {
    return null;
  }

  if (
    isMissingColumnError(insertError.message, "start_date") ||
    isMissingColumnError(insertError.message, "end_date")
  ) {
    const { start_date: _start, end_date: _end, ...withoutDates } = insertPayload;
    const { error: retryError } = await client
      .from("project_worker_assignments")
      .insert([withoutDates]);
    if (!retryError || isUniqueViolation(retryError.message)) {
      return retryError ? reopenExistingTargetRow(client, workerId, projectId, effectiveFrom) : null;
    }
    return retryError.message;
  }

  if (isUniqueViolation(insertError.message)) {
    return reopenExistingTargetRow(client, workerId, projectId, effectiveFrom);
  }

  return insertError.message;
}

async function reopenExistingTargetRow(
  client: SupabaseClient,
  workerId: string,
  projectId: string,
  effectiveFrom: string
): Promise<string | null> {
  const { data, error } = await client
    .from("project_worker_assignments")
    .select("id")
    .eq("worker_id", workerId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return error.message;
  if (!data?.id) return "Could not reopen the destination project assignment.";

  const { error: updateError } = await client
    .from("project_worker_assignments")
    .update({
      status: "Active",
      start_date: effectiveFrom,
      end_date: null,
    })
    .eq("id", data.id);

  if (
    updateError &&
    (isMissingColumnError(updateError.message, "start_date") ||
      isMissingColumnError(updateError.message, "end_date"))
  ) {
    const { error: statusError } = await client
      .from("project_worker_assignments")
      .update({ status: "Active" })
      .eq("id", data.id);
    return statusError?.message ?? null;
  }

  return updateError?.message ?? null;
}

async function applyLegacyStatusTransfer(
  client: SupabaseClient,
  input: {
    workerId: string;
    projectId: string;
    projectName: string;
    workerName: string | null;
  }
): Promise<string | null> {
  const { error: closeError } = await client
    .from("project_worker_assignments")
    .update({ status: "Transferred" })
    .eq("worker_id", input.workerId)
    .neq("project_id", input.projectId);

  if (closeError && !isMissingTableError(closeError.message, "project_worker_assignments")) {
    return closeError.message;
  }

  const { error: insertError } = await client.from("project_worker_assignments").insert([
    {
      worker_id: input.workerId,
      project_id: input.projectId,
      project_name: input.projectName || null,
      worker_name: input.workerName,
      status: "Active",
    },
  ]);

  if (!insertError || isUniqueViolation(insertError.message)) {
    if (insertError) {
      await client
        .from("project_worker_assignments")
        .update({ status: "Active" })
        .eq("worker_id", input.workerId)
        .eq("project_id", input.projectId);
    }
    return null;
  }

  return insertError.message;
}
