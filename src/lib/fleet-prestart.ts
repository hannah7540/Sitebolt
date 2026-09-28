import { insertWithFormMetadataFallback } from "@/lib/form-metadata-consolidation";
import { fetchOrganizationFleetById, type OrganizationFleetVehicle } from "@/lib/organization-fleet";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { stripMissingColumn, parseMissingColumnFromError } from "@/lib/form-payload-utils";
import { isSupabaseMissingColumnError } from "@/lib/supabase-errors";

export const FLEET_PRESTART_TEMPLATE_NAME = "Fleet Pre-Start";

export const FLEET_ASSIGNMENT_STATES = ["ACT", "NSW", "WA", "NZ"] as const;

export type FleetAssignmentKind = "state" | "project";

export function isFleetVehiclePrestart(row: {
  vehicle_type?: string | null;
  fleet_id?: string | null;
}): boolean {
  return (
    String(row.vehicle_type ?? "").trim().toLowerCase() === "fleet" ||
    Boolean(row.fleet_id)
  );
}

export async function submitFleetPrestart(input: {
  fleet: OrganizationFleetVehicle;
  operatorName: string;
  operatorWorkerId?: string | null;
  userId?: string | null;
  workingOrder: "Yes" | "No";
  workingOrderNotes?: string;
  defectsReported: "Yes" | "No";
  defectDetails?: string;
  currentKms: number;
  signatureUrl?: string | null;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const hasDefect = input.workingOrder === "No" || input.defectsReported === "Yes";
  const defectComments = [
    input.workingOrder === "No" ? input.workingOrderNotes?.trim() : "",
    input.defectsReported === "Yes" ? input.defectDetails?.trim() : "",
  ]
    .filter(Boolean)
    .join("\n");

  const projectId = input.fleet.state ? null : input.fleet.assigned_project_id;
  const assignedState = input.fleet.assigned_project_id ? null : input.fleet.state;

  const checkData = {
    template: FLEET_PRESTART_TEMPLATE_NAME,
    working_order: input.workingOrder,
    working_order_notes: input.workingOrderNotes?.trim() || null,
    defects_reported: input.defectsReported,
    defect_details: input.defectDetails?.trim() || null,
    current_kms: input.currentKms,
    worker_id: input.operatorWorkerId ?? null,
    worker_name: input.operatorName.trim(),
    user_id: input.userId ?? null,
  };

  const payload: Record<string, unknown> = {
    plant_id: null,
    fleet_id: input.fleet.id,
    vehicle_type: "fleet",
    fleet_unit_number: input.fleet.unit_number,
    operator_name: input.operatorName.trim(),
    operator_worker_id: input.operatorWorkerId ?? null,
    worker_id: input.operatorWorkerId ?? null,
    worker_name: input.operatorName.trim(),
    user_id: input.userId ?? null,
    project_id: projectId,
    site_id: projectId,
    assigned_state: assignedState,
    current_reading: input.currentKms,
    next_service_due: null,
    check_data: checkData,
    has_defect: hasDefect,
    defect_comments: defectComments || null,
    defect_summary: hasDefect ? defectComments.split("\n")[0] || "Fleet defect reported" : null,
    signature_url: input.signatureUrl ?? null,
    submitted_at: new Date().toISOString(),
  };

  const result = await insertWithFormMetadataFallback(supabase, "plant_prestarts", payload);
  if (result.error) {
    return { error: result.error };
  }

  await updateFleetReadingAfterPrestart(input.fleet.id, input.currentKms);
  return { error: null };
}

async function updateFleetReadingAfterPrestart(
  fleetId: string,
  currentKms: number
): Promise<void> {
  let payload: Record<string, unknown> = {
    current_kms: currentKms,
    current_hours: currentKms,
    updated_at: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await supabase.from("organization_fleet").update(payload).eq("id", fleetId);
    if (!error) return;
    if (!isSupabaseMissingColumnError(error)) return;
    const missing = parseMissingColumnFromError(error.message);
    if (!missing || !(missing in payload)) return;
    payload = stripMissingColumn(payload, missing);
  }
}

export async function loadFleetVehicleForPrestart(
  fleetId: string
): Promise<OrganizationFleetVehicle | null> {
  return fetchOrganizationFleetById(fleetId);
}
