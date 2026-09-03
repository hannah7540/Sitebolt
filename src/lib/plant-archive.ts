import { supabase, MASTER_PLANT_TABLE, type PlantAsset } from "./supabase";
import { parseMissingColumnFromError, stripMissingColumn } from "./form-payload-utils";
import { nullIfBlank } from "./form-payload-utils";

export const PLANT_ARCHIVE_REASONS = [
  "Sold",
  "Decommissioned",
  "Off Hire",
  "Other",
] as const;

export type PlantArchiveReason = (typeof PLANT_ARCHIVE_REASONS)[number];

const OPTIONAL_ARCHIVE_COLUMNS = [
  "archived_at",
  "archived_reason",
  "status",
] as const;

export function isPlantArchived(
  plant: Pick<PlantAsset, "status" | "archived_at">
): boolean {
  const status = String(plant.status ?? "").trim().toLowerCase();
  return status === "archived" || Boolean(plant.archived_at);
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

async function updatePlantArchivePayload(
  plantId: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  let currentPayload = { ...payload };

  for (let attempt = 0; attempt <= OPTIONAL_ARCHIVE_COLUMNS.length + 1; attempt += 1) {
    const { error } = await supabase
      .from(MASTER_PLANT_TABLE)
      .update(currentPayload)
      .eq("id", plantId);

    if (!error) return { error: null };

    const parsed = parseMissingColumnFromError(error.message);
    const missing =
      (parsed && parsed in currentPayload ? parsed : null) ??
      OPTIONAL_ARCHIVE_COLUMNS.find(
        (column) =>
          column in currentPayload && isMissingColumnError(error.message, column)
      );

    if (missing) {
      currentPayload = stripMissingColumn(currentPayload, missing);
      continue;
    }

    return { error: error.message };
  }

  return { error: "Failed to update plant archive state." };
}

export async function archivePlantAsset(
  plantId: string,
  reason: string
): Promise<{ error: string | null }> {
  const archivedReason = nullIfBlank(reason);
  if (!archivedReason) {
    return { error: "Please choose an archive reason." };
  }

  return updatePlantArchivePayload(plantId, {
    status: "archived",
    archived_at: new Date().toISOString(),
    archived_reason: archivedReason,
    updated_at: new Date().toISOString(),
  });
}

export async function restorePlantAsset(
  plantId: string
): Promise<{ error: string | null }> {
  return updatePlantArchivePayload(plantId, {
    status: "active",
    archived_at: null,
    archived_reason: null,
    updated_at: new Date().toISOString(),
  });
}

const RELATED_PLANT_DELETE_TARGETS = [
  { table: "project_plant_assignments", column: "plant_id" },
  { table: "plant_prestarts", column: "plant_id" },
  { table: "plant_service_history", column: "plant_id" },
  { table: "plant_service_schedules", column: "plant_id" },
  { table: "plant_equipment", column: "id" },
] as const;

export async function deletePlantAsset(
  plantId: string
): Promise<{ error: string | null }> {
  const id = plantId.trim();
  if (!id) return { error: "Plant id is required." };

  for (const target of RELATED_PLANT_DELETE_TARGETS) {
    const { error } = await supabase
      .from(target.table)
      .delete()
      .eq(target.column, id);
    if (error) {
      console.warn(
        `Plant delete cleanup skipped (${target.table}):`,
        error.message
      );
    }
  }

  const { error } = await supabase.from(MASTER_PLANT_TABLE).delete().eq("id", id);
  return { error: error?.message ?? null };
}

export function applyOptimisticPlantArchive(
  plant: PlantAsset,
  reason: string
): PlantAsset {
  return {
    ...plant,
    status: "archived",
    archived_at: new Date().toISOString(),
    archived_reason: nullIfBlank(reason),
  };
}

export function applyOptimisticPlantRestore(plant: PlantAsset): PlantAsset {
  return {
    ...plant,
    status: "active",
    archived_at: null,
    archived_reason: null,
  };
}
