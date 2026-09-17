import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { addDays, formatDateOnly } from "@/lib/scheduler-utils";
import {
  isSupabaseMissingColumnError,
  isSupabaseTableUnavailableError,
  toSupabaseRequestError,
} from "@/lib/supabase-errors";
import { parseMissingColumnFromError, stripMissingColumn } from "@/lib/form-payload-utils";

export const PLANT_PROJECT_ALLOCATIONS_TABLE = "plant_project_allocations";
export const YARD_PROJECT_LABEL = "Yard / Unassigned";

export interface PlantProjectAllocation {
  id: string;
  plant_id: string;
  project_id: string | null;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export interface ReassignPlantProjectInput {
  plantId: string;
  currentProjectId: string | null;
  targetProjectId: string | null;
  effectiveFrom: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

export function subtractOneCalendarDay(iso: string): string {
  const normalized = formatDateOnly(iso);
  if (!normalized) return "";
  return formatDateOnly(addDays(new Date(`${normalized}T00:00:00`), -1));
}

export function normalizePlantProjectAllocation(row: unknown): PlantProjectAllocation {
  const record = asRecord(row);
  return {
    id: String(record.id ?? ""),
    plant_id: str(record, "plant_id") ?? "",
    project_id: str(record, "project_id"),
    effective_from: formatDateOnly(str(record, "effective_from")),
    effective_to: formatDateOnly(str(record, "effective_to")) || null,
    created_at: str(record, "created_at") ?? "",
  };
}

function allocationCoversDate(allocation: PlantProjectAllocation, dateIso: string): boolean {
  if (!allocation.effective_from || allocation.effective_from > dateIso) return false;
  if (allocation.effective_to && allocation.effective_to < dateIso) return false;
  return true;
}

export function resolvePlantAllocationForDate(
  allocations: PlantProjectAllocation[],
  plantId: string,
  dateIso: string
): PlantProjectAllocation | null {
  const matches = allocations.filter(
    (allocation) => allocation.plant_id === plantId && allocationCoversDate(allocation, dateIso)
  );
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;
}

export function plantHasProjectAllocations(
  allocations: PlantProjectAllocation[],
  plantId: string
): boolean {
  return allocations.some((allocation) => allocation.plant_id === plantId);
}

async function insertWithMissingColumnRetry(
  table: string,
  payload: Record<string, unknown>
): Promise<{ data: Record<string, unknown> | null; error: string | null; missingTable: boolean }> {
  let current = { ...payload };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabase.from(table).insert(current).select("*").maybeSingle();
    if (!error) {
      return { data: data ? asRecord(data) : current, error: null, missingTable: false };
    }
    if (isSupabaseTableUnavailableError(toSupabaseRequestError(error), table)) {
      return { data: null, error: error.message, missingTable: true };
    }
    if (isSupabaseMissingColumnError(error)) {
      const missing = parseMissingColumnFromError(error.message);
      if (missing && missing in current) {
        current = stripMissingColumn(current, missing);
        continue;
      }
    }
    return { data: null, error: error.message, missingTable: false };
  }
  return { data: null, error: "Could not save allocation.", missingTable: false };
}

async function updateWithMissingColumnRetry(
  table: string,
  id: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null; missingTable: boolean }> {
  let current = { ...payload };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await supabase.from(table).update(current).eq("id", id);
    if (!error) return { error: null, missingTable: false };
    if (isSupabaseTableUnavailableError(toSupabaseRequestError(error), table)) {
      return { error: error.message, missingTable: true };
    }
    if (isSupabaseMissingColumnError(error)) {
      const missing = parseMissingColumnFromError(error.message);
      if (missing && missing in current) {
        current = stripMissingColumn(current, missing);
        continue;
      }
    }
    return { error: error.message, missingTable: false };
  }
  return { error: "Could not update allocation.", missingTable: false };
}

async function updatePlantAssignedDate(
  plantId: string,
  projectId: string | null,
  effectiveFrom: string
): Promise<void> {
  const payload: Record<string, unknown> = {
    project_id: projectId,
    assigned_project_id: projectId,
    current_project_id: projectId,
    assigned_date: effectiveFrom,
  };

  for (const table of ["plant", "plant_equipment"] as const) {
    let current = { ...payload };
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { error } = await supabase.from(table).update(current).eq("id", plantId);
      if (!error) break;
      if (isSupabaseTableUnavailableError(toSupabaseRequestError(error), table)) break;
      if (isSupabaseMissingColumnError(error)) {
        const missing = parseMissingColumnFromError(error.message);
        if (missing && missing in current) {
          current = stripMissingColumn(current, missing);
          continue;
        }
      }
      break;
    }
  }
}

export async function fetchPlantProjectAllocations(
  plantIds: string[]
): Promise<{ data: PlantProjectAllocation[]; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { data: [], error: null };
  }
  if (plantIds.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from(PLANT_PROJECT_ALLOCATIONS_TABLE)
    .select("*")
    .in("plant_id", plantIds)
    .order("effective_from", { ascending: true });

  if (error) {
    if (isSupabaseTableUnavailableError(toSupabaseRequestError(error), PLANT_PROJECT_ALLOCATIONS_TABLE)) {
      return { data: [], error: null };
    }
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? [])
      .map(normalizePlantProjectAllocation)
      .filter((row) => row.id && row.plant_id && row.effective_from),
    error: null,
  };
}

export async function reassignPlantProjectAllocation(
  input: ReassignPlantProjectInput
): Promise<{ data: PlantProjectAllocation[]; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { data: [], error: "Supabase is not configured." };
  }

  const plantId = input.plantId.trim();
  const effectiveFrom = formatDateOnly(input.effectiveFrom);
  const targetProjectId = input.targetProjectId?.trim() || null;
  const currentProjectId = input.currentProjectId?.trim() || null;

  if (!plantId) return { data: [], error: "Select a machine." };
  if (!effectiveFrom) return { data: [], error: "Effective From Date is required." };

  const priorTo = subtractOneCalendarDay(effectiveFrom);

  const { data: existingRows, error: existingError } = await supabase
    .from(PLANT_PROJECT_ALLOCATIONS_TABLE)
    .select("*")
    .eq("plant_id", plantId)
    .order("effective_from", { ascending: true });

  let tableAvailable = true;
  if (existingError) {
    if (
      isSupabaseTableUnavailableError(
        toSupabaseRequestError(existingError),
        PLANT_PROJECT_ALLOCATIONS_TABLE
      )
    ) {
      tableAvailable = false;
    } else {
      return { data: [], error: existingError.message };
    }
  }

  if (tableAvailable) {
    const existing = (existingRows ?? [])
      .map(normalizePlantProjectAllocation)
      .filter((row) => row.id && row.plant_id);

    const openRows = existing.filter((row) => !row.effective_to);
    if (openRows.length > 0) {
      for (const open of openRows) {
        if (!priorTo || priorTo < open.effective_from) {
          const { error: deleteError } = await supabase
            .from(PLANT_PROJECT_ALLOCATIONS_TABLE)
            .delete()
            .eq("id", open.id);
          if (
            deleteError &&
            !isSupabaseTableUnavailableError(
              toSupabaseRequestError(deleteError),
              PLANT_PROJECT_ALLOCATIONS_TABLE
            )
          ) {
            return { data: [], error: deleteError.message };
          }
          continue;
        }

        const closeResult = await updateWithMissingColumnRetry(
          PLANT_PROJECT_ALLOCATIONS_TABLE,
          open.id,
          { effective_to: priorTo }
        );
        if (closeResult.missingTable) {
          tableAvailable = false;
          break;
        }
        if (closeResult.error) {
          return { data: [], error: closeResult.error };
        }
      }
    } else if (priorTo) {
      const backfill = await insertWithMissingColumnRetry(PLANT_PROJECT_ALLOCATIONS_TABLE, {
        plant_id: plantId,
        project_id: currentProjectId,
        effective_from: "1970-01-01",
        effective_to: priorTo,
      });
      if (backfill.missingTable) {
        tableAvailable = false;
      } else if (backfill.error) {
        return { data: [], error: backfill.error };
      }
    }

    if (tableAvailable) {
      const inserted = await insertWithMissingColumnRetry(PLANT_PROJECT_ALLOCATIONS_TABLE, {
        plant_id: plantId,
        project_id: targetProjectId,
        effective_from: effectiveFrom,
        effective_to: null,
      });
      if (inserted.missingTable) {
        tableAvailable = false;
      } else if (inserted.error) {
        return { data: [], error: inserted.error };
      }
    }
  }

  await updatePlantAssignedDate(plantId, targetProjectId, effectiveFrom);

  if (!tableAvailable) {
    return { data: [], error: null };
  }

  return fetchPlantProjectAllocations([plantId]);
}
