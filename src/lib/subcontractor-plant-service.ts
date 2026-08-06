import { supabase, isSupabaseConfigured } from "./supabase";
import { normalizeWorkerUuidArray } from "./project-resolver";
import {
  buildDualColumnPlantPayload,
  buildSubcontractorPlantPayload,
  getSubcontractorPlantLastServiceDate,
  getSubcontractorPlantNotes,
  getSubcontractorPlantRiskAssessmentUrl,
  getSubcontractorPlantSerialNumber,
  getSubcontractorPlantServiceHistoryUrl,
  parseCurrentHours,
  parseNextServiceHours,
  resolvePlantNotesFields,
  type SubcontractorPlantFormInput,
} from "./subcontractor-plant-payload";

export const PRIMARY_PLANT_TABLE = "plant_equipment";
export const FALLBACK_PLANT_TABLE = "subcontractor_plant";

export interface SubcontractorPlant {
  id: string;
  subcontractor_id: string;
  unit_number: string;
  unit_reference: string | null;
  equipment_category: string | null;
  category: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  vin: string | null;
  current_hours: number;
  next_service_hours: number;
  last_service_date: string | null;
  service_history_date: string | null;
  service_history_doc_url: string | null;
  service_history_url: string | null;
  plant_risk_assessment_doc_url: string | null;
  plant_risk_assessment_url: string | null;
  risk_assessment_doc_url: string | null;
  is_subcontractor_plant: boolean;
  ownership_type: string | null;
  registration_expiry: string | null;
  service_expiry: string | null;
  assigned_project_id: string | null;
  assigned_project_ids: string[];
  status: string;
  notes: string;
  comments: string;
  description: string;
  created_at?: string;
}

function normalizePlantText(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

export function normalizeSubcontractorPlantRow(
  row: Record<string, unknown>
): SubcontractorPlant {
  const unitNumber = normalizePlantText(row.unit_number).trim();
  const unitReference =
    normalizePlantText(row.unit_reference).trim() || unitNumber || null;
  const equipmentCategory =
    normalizePlantText(row.equipment_category).trim() ||
    normalizePlantText(row.category).trim() ||
    null;
  const serialNumber = getSubcontractorPlantSerialNumber({
    serial_number: normalizePlantText(row.serial_number) || null,
    vin: normalizePlantText(row.vin) || null,
  });
  const lastServiceDate = getSubcontractorPlantLastServiceDate({
    last_service_date: normalizePlantText(row.last_service_date) || null,
    service_history_date: normalizePlantText(row.service_history_date) || null,
  });
  const serviceHistoryUrl = getSubcontractorPlantServiceHistoryUrl({
    service_history_doc_url:
      normalizePlantText(row.service_history_doc_url) || null,
    service_history_url: normalizePlantText(row.service_history_url) || null,
  });
  const riskAssessmentUrl = getSubcontractorPlantRiskAssessmentUrl({
    plant_risk_assessment_doc_url:
      normalizePlantText(row.plant_risk_assessment_doc_url) || null,
    plant_risk_assessment_url:
      normalizePlantText(row.plant_risk_assessment_url) || null,
    risk_assessment_doc_url:
      normalizePlantText(row.risk_assessment_doc_url) || null,
  });
  const assignedProjectIds = normalizeWorkerUuidArray(
    row.assigned_project_ids as string[] | null
  );
  const assignedProjectId =
    normalizePlantText(row.assigned_project_id).trim() ||
    assignedProjectIds[0] ||
    null;
  const noteFields = resolvePlantNotesFields({
    notes: normalizePlantText(row.notes),
    comments: normalizePlantText(row.comments),
    description: normalizePlantText(row.description),
  });

  return {
    id: String(row.id ?? ""),
    subcontractor_id: String(row.subcontractor_id ?? ""),
    unit_number: unitNumber,
    unit_reference: unitReference,
    equipment_category: equipmentCategory,
    category: equipmentCategory,
    make: normalizePlantText(row.make) || null,
    model: normalizePlantText(row.model) || null,
    serial_number: serialNumber,
    vin: serialNumber,
    current_hours: parseCurrentHours(row.current_hours as string | number | null),
    next_service_hours: parseNextServiceHours(
      row.next_service_hours as string | number | null
    ),
    last_service_date: lastServiceDate,
    service_history_date: lastServiceDate,
    service_history_doc_url: serviceHistoryUrl,
    service_history_url: serviceHistoryUrl,
    plant_risk_assessment_doc_url: riskAssessmentUrl,
    plant_risk_assessment_url: riskAssessmentUrl,
    risk_assessment_doc_url: riskAssessmentUrl,
    is_subcontractor_plant: Boolean(row.is_subcontractor_plant),
    ownership_type: normalizePlantText(row.ownership_type) || null,
    registration_expiry: normalizePlantText(row.registration_expiry) || null,
    service_expiry: normalizePlantText(row.service_expiry) || null,
    assigned_project_id: assignedProjectId,
    assigned_project_ids: assignedProjectIds,
    status: normalizePlantText(row.status) || "Available",
    notes: noteFields.notes,
    comments: noteFields.comments,
    description: noteFields.description,
    created_at: row.created_at as string | undefined,
  };
}

function isMissingPlantTableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    (lower.includes("relation") ||
      lower.includes("table") ||
      lower.includes("schema cache")) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("not found"))
  );
}

function isMissingPlantColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("column") &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
}

async function attemptPlantInsert(
  table: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { error } = await supabase.from(table).insert([payload]);
    if (!error) {
      return { ok: true, error: null };
    }
    return { ok: false, error: error.message };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Insert failed",
    };
  }
}

async function querySubcontractorPlantTable(
  table: string,
  subcontractorId: string
): Promise<{
  rows: SubcontractorPlant[];
  tableMissing: boolean;
  error: string | null;
}> {
  const id = subcontractorId.trim();

  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("subcontractor_id", id)
      .order("unit_number", { ascending: true, nullsFirst: false });

    if (!error) {
      return {
        rows: (data ?? []).map((row) =>
          normalizeSubcontractorPlantRow(row as Record<string, unknown>)
        ),
        tableMissing: false,
        error: null,
      };
    }

    if (isMissingPlantTableError(error.message)) {
      return { rows: [], tableMissing: true, error: error.message };
    }

    if (isMissingPlantColumnError(error.message)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from(table)
        .select("*")
        .order("unit_number", { ascending: true, nullsFirst: false });

      if (!legacyError) {
        const rows = (legacyData ?? [])
          .map((row) =>
            normalizeSubcontractorPlantRow(row as Record<string, unknown>)
          )
          .filter((row) => row.subcontractor_id === id);
        return { rows, tableMissing: false, error: null };
      }

      if (isMissingPlantTableError(legacyError.message)) {
        return { rows: [], tableMissing: true, error: legacyError.message };
      }

      return { rows: [], tableMissing: false, error: legacyError.message };
    }

    return { rows: [], tableMissing: false, error: error.message };
  } catch (error) {
    return {
      rows: [],
      tableMissing: false,
      error: error instanceof Error ? error.message : "Fetch failed",
    };
  }
}

/**
 * Loads subcontractor plant from plant_equipment by subcontractor_id.
 * Falls back to subcontractor_plant when the primary result is empty.
 * Does not filter on assigned_project_id or status so unassigned plant is visible.
 */
export async function fetchSubcontractorPlant(
  subcontractorId: string
): Promise<SubcontractorPlant[]> {
  if (!subcontractorId.trim() || !isSupabaseConfigured()) return [];

  const primary = await querySubcontractorPlantTable(
    PRIMARY_PLANT_TABLE,
    subcontractorId
  );

  if (primary.rows.length > 0) {
    return primary.rows;
  }

  if (primary.error && !primary.tableMissing) {
    console.warn(
      `fetchSubcontractorPlant primary query warning (${PRIMARY_PLANT_TABLE}):`,
      primary.error
    );
  }

  const fallback = await querySubcontractorPlantTable(
    FALLBACK_PLANT_TABLE,
    subcontractorId
  );

  if (fallback.rows.length > 0) {
    return fallback.rows;
  }

  if (fallback.error && !fallback.tableMissing) {
    console.error(
      `fetchSubcontractorPlant failed (${FALLBACK_PLANT_TABLE}):`,
      fallback.error
    );
  }

  if (!primary.tableMissing) {
    return primary.rows;
  }

  return fallback.rows;
}

export async function insertSubcontractorPlantFromForm(
  input: SubcontractorPlantFormInput
): Promise<{ error: string | null }> {
  try {
    const payload = buildSubcontractorPlantPayload(input);
    return await insertSubcontractorPlant(payload);
  } catch (error) {
    console.error("insertSubcontractorPlantFromForm failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to save plant equipment.",
    };
  }
}

export async function insertSubcontractorPlant(
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const fullPayload = buildDualColumnPlantPayload(payload);
  const unitNumber = normalizePlantText(fullPayload.unit_number).trim();
  if (!unitNumber) {
    return { error: "Unit number is required." };
  }

  let lastError: string | null = null;

  try {
    const legacyResult = await attemptPlantInsert(
      FALLBACK_PLANT_TABLE,
      fullPayload
    );
    if (legacyResult.ok) {
      return { error: null };
    }
    lastError = legacyResult.error;
  } catch (error) {
    lastError =
      error instanceof Error ? error.message : "subcontractor_plant insert failed";
  }

  try {
    const primaryResult = await attemptPlantInsert(
      PRIMARY_PLANT_TABLE,
      fullPayload
    );
    if (primaryResult.ok) {
      return { error: null };
    }
    lastError = primaryResult.error ?? lastError;
  } catch (error) {
    lastError =
      error instanceof Error ? error.message : "plant_equipment insert failed";
  }

  if (
    lastError &&
    (isMissingPlantTableError(lastError) || isMissingPlantColumnError(lastError))
  ) {
    for (const table of [PRIMARY_PLANT_TABLE, FALLBACK_PLANT_TABLE]) {
      const retryResult = await attemptPlantInsert(table, fullPayload);
      if (retryResult.ok) {
        return { error: null };
      }
      lastError = retryResult.error ?? lastError;
    }
  }

  return { error: lastError ?? "Failed to save plant equipment." };
}
