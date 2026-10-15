import { supabase, isSupabaseConfigured } from "./supabase";
import { formatDateOnly } from "./scheduler-utils";

export type PlantMaintenanceType = "maintenance" | "service";

export interface PlantMaintenanceRecord {
  id: string;
  plant_id: string;
  maintenance_type: PlantMaintenanceType;
  scheduled_date: string;
  completed_at: string | null;
}

function asRecord(row: unknown): Record<string, unknown> {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

function isMissingRelation(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("plant_maintenance") &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
}

function mapRow(row: Record<string, unknown>): PlantMaintenanceRecord | null {
  const id = String(row.id ?? "").trim();
  const plantId = String(row.plant_id ?? "").trim();
  const scheduled = String(row.scheduled_date ?? "").slice(0, 10);
  if (!id || !plantId || !scheduled) return null;
  const type = String(row.maintenance_type ?? "").toLowerCase();
  return {
    id,
    plant_id: plantId,
    maintenance_type: type === "service" ? "service" : "maintenance",
    scheduled_date: scheduled,
    completed_at: row.completed_at ? String(row.completed_at) : null,
  };
}

export function isMaintenanceStillOpen(
  row: PlantMaintenanceRecord,
  todayIso: string = formatDateOnly(new Date())
): boolean {
  if (row.completed_at) return false;
  return row.scheduled_date >= todayIso;
}

export function maintenanceClearsWarning(
  row: PlantMaintenanceRecord,
  type: PlantMaintenanceType,
  todayIso: string = formatDateOnly(new Date())
): boolean {
  if (row.maintenance_type !== type) return false;
  if (row.completed_at) return true;
  return row.scheduled_date <= todayIso;
}

export async function fetchPlantMaintenance(
  plantIds?: string[]
): Promise<PlantMaintenanceRecord[]> {
  if (!isSupabaseConfigured()) return [];

  let query = supabase
    .from("plant_maintenance")
    .select("id, plant_id, maintenance_type, scheduled_date, completed_at")
    .order("scheduled_date", { ascending: true });

  if (plantIds?.length) {
    query = query.in("plant_id", plantIds);
  }

  const { data, error } = await query;
  if (error) {
    if (!isMissingRelation(error.message)) {
      console.warn("[plant_maintenance] fetch:", error.message);
    }
    return [];
  }

  return (data ?? [])
    .map((row) => mapRow(asRecord(row)))
    .filter((row): row is PlantMaintenanceRecord => Boolean(row));
}

export async function insertPlantMaintenance(input: {
  plantId: string;
  maintenanceType: PlantMaintenanceType;
  scheduledDate: string;
}): Promise<{ record: PlantMaintenanceRecord | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { record: null, error: "Supabase is not configured." };
  }
  const scheduledDate = input.scheduledDate.trim().slice(0, 10);
  if (!input.plantId.trim() || !scheduledDate) {
    return { record: null, error: "Plant and date are required." };
  }

  const { data, error } = await supabase
    .from("plant_maintenance")
    .insert({
      plant_id: input.plantId,
      maintenance_type: input.maintenanceType,
      scheduled_date: scheduledDate,
    })
    .select("id, plant_id, maintenance_type, scheduled_date, completed_at")
    .maybeSingle();

  if (error) {
    return { record: null, error: error.message };
  }
  return { record: data ? mapRow(asRecord(data)) : null, error: null };
}
