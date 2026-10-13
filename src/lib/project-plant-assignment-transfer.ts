import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateOnly } from "@/lib/scheduler-utils";
import { dayBeforeIso } from "@/lib/project-worker-assignment-transfer";

export interface PermanentPlantAssignmentTransferInput {
  plantId: string;
  projectId: string | null;
  projectName: string;
  plantName?: string | null;
  effectiveFrom: string;
}

type AssignmentRow = {
  id: string;
  project_id: string;
  plant_id: string;
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
    lower.includes("project_plant_assignments_active_unique") ||
    lower.includes("project_id_plant_id")
  );
}

function isOpenAssignment(row: AssignmentRow): boolean {
  return !formatDateOnly(row.end_date);
}

/**
 * Close the plant's current open project assignment the day before
 * `effectiveFrom`, then insert an open-ended row for the new project.
 * `end_date IS NULL` means the assignment continues indefinitely.
 */
export async function applyPermanentPlantAssignmentTransfer(
  client: SupabaseClient,
  input: PermanentPlantAssignmentTransferInput
): Promise<string | null> {
  const plantId = input.plantId.trim();
  const projectId = input.projectId?.trim() || null;
  const projectName = input.projectName.trim();
  const effectiveFrom = formatDateOnly(input.effectiveFrom);
  const plantName = input.plantName?.trim() || null;

  if (!plantId || !effectiveFrom) {
    return "Plant and effective from date are required.";
  }

  const priorEnd = dayBeforeIso(effectiveFrom);

  const { data, error } = await client
    .from("project_plant_assignments")
    .select("id, project_id, plant_id, start_date, end_date, status")
    .eq("plant_id", plantId);

  if (error) {
    if (isMissingTableError(error.message, "project_plant_assignments")) {
      return null;
    }
    if (
      isMissingColumnError(error.message, "start_date") ||
      isMissingColumnError(error.message, "end_date")
    ) {
      return applyLegacyStatusTransfer(client, {
        plantId,
        projectId,
        projectName,
        plantName,
      });
    }
    return error.message;
  }

  const rows = (data ?? []) as AssignmentRow[];
  const openRows = rows.filter(isOpenAssignment);

  for (const row of openRows) {
    if (projectId && row.project_id === projectId) {
      continue;
    }

    const start = formatDateOnly(row.start_date);
    if (start && priorEnd && priorEnd < start) {
      const { error: deleteError } = await client
        .from("project_plant_assignments")
        .delete()
        .eq("id", row.id);
      if (deleteError) return deleteError.message;
      continue;
    }

    const { error: updateError } = await client
      .from("project_plant_assignments")
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
          .from("project_plant_assignments")
          .update({ status: "Transferred" })
          .eq("id", row.id);
        if (statusError) return statusError.message;
        continue;
      }
      return updateError.message;
    }
  }

  if (!projectId) {
    return null;
  }

  const existingOpenOnTarget = openRows.find((row) => row.project_id === projectId);
  if (existingOpenOnTarget) {
    const { error: keepError } = await client
      .from("project_plant_assignments")
      .update({
        status: "Assigned",
        project_name: projectName || undefined,
        plant_name: plantName || undefined,
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
    plant_id: plantId,
    project_id: projectId,
    project_name: projectName || null,
    plant_name: plantName,
    status: "Assigned",
    start_date: effectiveFrom,
    end_date: null,
  };

  const { error: insertError } = await client
    .from("project_plant_assignments")
    .insert([insertPayload]);

  if (!insertError) return null;

  if (isMissingTableError(insertError.message, "project_plant_assignments")) {
    return null;
  }

  if (
    isMissingColumnError(insertError.message, "start_date") ||
    isMissingColumnError(insertError.message, "end_date")
  ) {
    const { start_date: _start, end_date: _end, ...withoutDates } = insertPayload;
    const { error: retryError } = await client
      .from("project_plant_assignments")
      .insert([withoutDates]);
    if (!retryError || isUniqueViolation(retryError.message)) {
      return retryError
        ? reopenExistingTargetRow(client, plantId, projectId, effectiveFrom)
        : null;
    }
    return retryError.message;
  }

  if (isUniqueViolation(insertError.message)) {
    return reopenExistingTargetRow(client, plantId, projectId, effectiveFrom);
  }

  return insertError.message;
}

async function reopenExistingTargetRow(
  client: SupabaseClient,
  plantId: string,
  projectId: string,
  effectiveFrom: string
): Promise<string | null> {
  const { data, error } = await client
    .from("project_plant_assignments")
    .select("id")
    .eq("plant_id", plantId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return error.message;
  if (!data?.id) return "Could not reopen the destination project assignment.";

  const { error: updateError } = await client
    .from("project_plant_assignments")
    .update({
      status: "Assigned",
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
      .from("project_plant_assignments")
      .update({ status: "Assigned" })
      .eq("id", data.id);
    return statusError?.message ?? null;
  }

  return updateError?.message ?? null;
}

async function applyLegacyStatusTransfer(
  client: SupabaseClient,
  input: {
    plantId: string;
    projectId: string | null;
    projectName: string;
    plantName: string | null;
  }
): Promise<string | null> {
  if (input.projectId) {
    const { error: closeError } = await client
      .from("project_plant_assignments")
      .update({ status: "Transferred" })
      .eq("plant_id", input.plantId)
      .neq("project_id", input.projectId);

    if (closeError && !isMissingTableError(closeError.message, "project_plant_assignments")) {
      return closeError.message;
    }
  } else {
    const { error: closeError } = await client
      .from("project_plant_assignments")
      .update({ status: "Transferred" })
      .eq("plant_id", input.plantId);

    if (closeError && !isMissingTableError(closeError.message, "project_plant_assignments")) {
      return closeError.message;
    }
    return null;
  }

  const { error: insertError } = await client.from("project_plant_assignments").insert([
    {
      plant_id: input.plantId,
      project_id: input.projectId,
      project_name: input.projectName || null,
      plant_name: input.plantName,
      status: "Assigned",
    },
  ]);

  if (!insertError || isUniqueViolation(insertError.message)) {
    if (insertError) {
      await client
        .from("project_plant_assignments")
        .update({ status: "Assigned" })
        .eq("plant_id", input.plantId)
        .eq("project_id", input.projectId);
    }
    return null;
  }

  return insertError.message;
}
