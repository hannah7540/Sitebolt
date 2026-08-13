import { supabase, isSupabaseConfigured } from "./supabase";

export interface PlantServiceHistoryRecord {
  id: string;
  plant_id: string;
  service_date: string;
  hours_logged: number | null;
  description: string | null;
  technician_company: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PlantServiceHistoryInput {
  serviceDate: string;
  hoursLogged?: number | null;
  description?: string | null;
  technicianCompany?: string | null;
}

function normalizeServiceHistoryRow(
  row: Record<string, unknown>
): PlantServiceHistoryRecord {
  return {
    id: String(row.id),
    plant_id: String(row.plant_id),
    service_date: String(row.service_date),
    hours_logged:
      row.hours_logged == null || row.hours_logged === ""
        ? null
        : Number(row.hours_logged),
    description: row.description ? String(row.description) : null,
    technician_company: row.technician_company
      ? String(row.technician_company)
      : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function buildServiceHistoryPayload(
  input: PlantServiceHistoryInput
): Record<string, unknown> {
  return {
    service_date: input.serviceDate,
    hours_logged: input.hoursLogged ?? null,
    description: input.description?.trim() || null,
    technician_company: input.technicianCompany?.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchPlantServiceHistory(
  plantId: string
): Promise<PlantServiceHistoryRecord[]> {
  if (!isSupabaseConfigured() || !plantId.trim()) return [];

  const { data, error } = await supabase
    .from("plant_service_history")
    .select("*")
    .eq("plant_id", plantId)
    .order("service_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (!error.message.toLowerCase().includes("plant_service_history")) {
      console.warn("Failed to fetch plant service history:", error.message);
    }
    return [];
  }

  return (data ?? []).map((row) =>
    normalizeServiceHistoryRow(row as Record<string, unknown>)
  );
}

export async function insertPlantServiceHistory(
  plantId: string,
  input: PlantServiceHistoryInput
): Promise<{ error: string | null; data: PlantServiceHistoryRecord | null }> {
  if (!input.serviceDate.trim()) {
    return { error: "Service date is required.", data: null };
  }

  const { data, error } = await supabase
    .from("plant_service_history")
    .insert([{ plant_id: plantId, ...buildServiceHistoryPayload(input) }])
    .select("*")
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  return {
    error: null,
    data: normalizeServiceHistoryRow(data as Record<string, unknown>),
  };
}

export async function updatePlantServiceHistory(
  id: string,
  input: PlantServiceHistoryInput
): Promise<{ error: string | null; data: PlantServiceHistoryRecord | null }> {
  if (!input.serviceDate.trim()) {
    return { error: "Service date is required.", data: null };
  }

  const { data, error } = await supabase
    .from("plant_service_history")
    .update(buildServiceHistoryPayload(input))
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  return {
    error: null,
    data: normalizeServiceHistoryRow(data as Record<string, unknown>),
  };
}

export async function deletePlantServiceHistory(
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("plant_service_history").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export function formatPlantServiceHistoryDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
