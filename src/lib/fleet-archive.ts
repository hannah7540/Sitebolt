import { supabase } from "./supabase";
import { parseMissingColumnFromError, stripMissingColumn } from "./form-payload-utils";
import { nullIfBlank } from "./form-payload-utils";
import type { OrganizationFleetVehicle } from "./organization-fleet";

export const FLEET_ARCHIVE_REASONS = [
  "Sold",
  "Decommissioned",
  "Written Off",
  "Other",
] as const;

export type FleetArchiveReason = (typeof FLEET_ARCHIVE_REASONS)[number];

const FLEET_TABLE = "organization_fleet";

const OPTIONAL_ARCHIVE_COLUMNS = [
  "archived_at",
  "archived_reason",
  "status",
  "updated_at",
] as const;

export function isFleetArchived(
  vehicle: Pick<OrganizationFleetVehicle, "status" | "archived_at">
): boolean {
  const status = String(vehicle.status ?? "").trim().toLowerCase();
  return status === "archived" || Boolean(vehicle.archived_at);
}

export function fleetVehicleDisplayName(vehicle: OrganizationFleetVehicle): string {
  return (
    vehicle.registration?.trim() ||
    vehicle.unit_number.trim() ||
    "this vehicle"
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

async function updateFleetArchivePayload(
  fleetId: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  let currentPayload = { ...payload };

  for (let attempt = 0; attempt <= OPTIONAL_ARCHIVE_COLUMNS.length + 1; attempt += 1) {
    const { error } = await supabase
      .from(FLEET_TABLE)
      .update(currentPayload)
      .eq("id", fleetId);

    if (!error) return { error: null };

    const lower = error.message.toLowerCase();
    if (
      "status" in currentPayload &&
      lower.includes("status") &&
      (lower.includes("check") || lower.includes("constraint"))
    ) {
      currentPayload = stripMissingColumn(currentPayload, "status");
      continue;
    }

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

  return { error: "Failed to update fleet archive state." };
}

export async function archiveFleetVehicle(
  fleetId: string,
  reason: string
): Promise<{ error: string | null }> {
  const archivedReason = nullIfBlank(reason);
  if (!archivedReason) {
    return { error: "Please choose an archive reason." };
  }

  return updateFleetArchivePayload(fleetId, {
    status: "archived",
    archived_at: new Date().toISOString(),
    archived_reason: archivedReason,
    updated_at: new Date().toISOString(),
  });
}

export async function restoreFleetVehicle(
  fleetId: string
): Promise<{ error: string | null }> {
  return updateFleetArchivePayload(fleetId, {
    status: "Active",
    archived_at: null,
    archived_reason: null,
    updated_at: new Date().toISOString(),
  });
}

export async function deleteFleetVehicle(
  fleetId: string
): Promise<{ error: string | null }> {
  const id = fleetId.trim();
  if (!id) return { error: "Vehicle id is required." };

  const { error: workerError } = await supabase
    .from("workers")
    .update({
      has_company_vehicle: false,
      assigned_vehicle_asset_id: null,
    })
    .eq("assigned_vehicle_asset_id", id);

  if (workerError) {
    console.warn("Fleet delete worker cleanup skipped:", workerError.message);
  }

  const { error } = await supabase.from(FLEET_TABLE).delete().eq("id", id);
  return { error: error?.message ?? null };
}

export function applyOptimisticFleetArchive(
  vehicle: OrganizationFleetVehicle,
  reason: string
): OrganizationFleetVehicle {
  return {
    ...vehicle,
    status: "archived",
    archived_at: new Date().toISOString(),
    archived_reason: nullIfBlank(reason),
  };
}

export function applyOptimisticFleetRestore(
  vehicle: OrganizationFleetVehicle
): OrganizationFleetVehicle {
  return {
    ...vehicle,
    status: "Active",
    archived_at: null,
    archived_reason: null,
  };
}
