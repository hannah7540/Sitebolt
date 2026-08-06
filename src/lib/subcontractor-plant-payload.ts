function trimText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function optionalPlantText(
  value: string | null | undefined
): string | null {
  const trimmed = trimText(value);
  return trimmed || null;
}

export function optionalPlantDate(
  value: string | null | undefined
): string | null {
  const trimmed = trimText(value);
  return trimmed || null;
}

/** Current machine hours — empty or invalid input defaults to 0. */
export function parseCurrentHours(
  value: string | number | null | undefined
): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = parseFloat(trimText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Next service interval hours — empty or invalid input defaults to 250. */
export function parseNextServiceHours(
  value: string | number | null | undefined
): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 250;
  }
  const parsed = parseFloat(trimText(value));
  return Number.isFinite(parsed) ? parsed : 250;
}

/** @deprecated Use parseCurrentHours */
export function parsePlantHours(
  value: string | number | null | undefined
): number {
  return parseCurrentHours(value);
}

export interface SubcontractorPlantFormInput {
  subcontractorId: string;
  unitNumber: string;
  equipmentCategory?: string;
  make?: string;
  model?: string;
  serialNumber?: string;
  currentHours?: string | number;
  nextServiceHours?: string | number;
  lastServiceDate?: string;
  serviceHistoryDocUrl?: string | null;
  plantRiskAssessmentDocUrl?: string | null;
  assignedProjectId?: string | null;
  notes?: string;
  comments?: string;
  description?: string;
}

function normalizePayloadText(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Notes text for writes — always a string, never undefined. */
export function normalizePlantNotesValue(
  value: string | null | undefined
): string {
  return trimText(value ?? "");
}

/** Resolve notes / comments / description aliases for insert payloads. */
export function resolvePlantNotesFields(input: {
  notes?: string | null;
  comments?: string | null;
  description?: string | null;
}): { notes: string; comments: string; description: string } {
  const notes = normalizePlantNotesValue(input.notes);
  const comments = normalizePlantNotesValue(input.comments) || notes;
  const description = normalizePlantNotesValue(input.description) || notes;
  return { notes, comments, description };
}

/** Safe read — falls back across notes, comments, and description columns. */
export function getSubcontractorPlantNotes(plant: {
  notes?: string | null;
  comments?: string | null;
  description?: string | null;
}): string {
  return (
    normalizePlantNotesValue(plant.notes) ||
    normalizePlantNotesValue(plant.comments) ||
    normalizePlantNotesValue(plant.description) ||
    ""
  );
}

/**
 * Builds a single insert payload with every known plant column alias populated
 * so either plant_equipment or subcontractor_plant can accept the row.
 */
export function buildSubcontractorPlantPayload(
  input: SubcontractorPlantFormInput
): Record<string, unknown> {
  const unitNumber = trimText(input.unitNumber);
  const equipmentCategory = optionalPlantText(input.equipmentCategory);
  const serialNumber = optionalPlantText(input.serialNumber);
  const lastServiceDate = optionalPlantDate(input.lastServiceDate);
  const serviceHistoryUrl = input.serviceHistoryDocUrl ?? null;
  const riskAssessmentUrl = input.plantRiskAssessmentDocUrl ?? null;
  const assignedProjectId = optionalPlantText(input.assignedProjectId);
  const noteFields = resolvePlantNotesFields({
    notes: input.notes,
    comments: input.comments,
    description: input.description,
  });

  return {
    unit_number: unitNumber,
    unit_reference: unitNumber || null,
    equipment_category: equipmentCategory,
    category: equipmentCategory,
    make: optionalPlantText(input.make),
    model: optionalPlantText(input.model),
    serial_number: serialNumber,
    vin: serialNumber,
    current_hours: parseCurrentHours(input.currentHours),
    next_service_hours: parseNextServiceHours(input.nextServiceHours),
    last_service_date: lastServiceDate,
    service_history_date: lastServiceDate,
    service_history_doc_url: serviceHistoryUrl,
    service_history_url: serviceHistoryUrl,
    plant_risk_assessment_doc_url: riskAssessmentUrl,
    plant_risk_assessment_url: riskAssessmentUrl,
    risk_assessment_doc_url: riskAssessmentUrl,
    assigned_project_id: assignedProjectId,
    assigned_project_ids: assignedProjectId ? [assignedProjectId] : [],
    subcontractor_id: input.subcontractorId.trim() || null,
    is_subcontractor_plant: true,
    ownership_type: "Subcontractor",
    status: "Available",
    notes: noteFields.notes,
    comments: noteFields.comments,
    description: noteFields.description,
  };
}

/** Re-normalize an existing payload object with all alias columns set. */
export function buildDualColumnPlantPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const unitNumber =
    trimText(normalizePayloadText(payload.unit_number)) ||
    trimText(normalizePayloadText(payload.unit_reference));
  const equipmentCategory =
    optionalPlantText(normalizePayloadText(payload.equipment_category)) ??
    optionalPlantText(normalizePayloadText(payload.category));
  const serialNumber =
    optionalPlantText(normalizePayloadText(payload.serial_number)) ??
    optionalPlantText(normalizePayloadText(payload.vin));
  const lastServiceDate =
    optionalPlantDate(normalizePayloadText(payload.last_service_date)) ??
    optionalPlantDate(normalizePayloadText(payload.service_history_date));
  const serviceHistoryUrl =
    normalizePayloadText(payload.service_history_doc_url) ||
    normalizePayloadText(payload.service_history_url) ||
    null;
  const riskAssessmentUrl =
    normalizePayloadText(payload.plant_risk_assessment_doc_url) ||
    normalizePayloadText(payload.plant_risk_assessment_url) ||
    normalizePayloadText(payload.risk_assessment_doc_url) ||
    null;
  const assignedProjectId =
    optionalPlantText(normalizePayloadText(payload.assigned_project_id)) ??
    (Array.isArray(payload.assigned_project_ids) &&
    payload.assigned_project_ids.length > 0
      ? optionalPlantText(String(payload.assigned_project_ids[0]))
      : null);
  const noteFields = resolvePlantNotesFields({
    notes: normalizePayloadText(payload.notes),
    comments: normalizePayloadText(payload.comments),
    description: normalizePayloadText(payload.description),
  });

  return {
    unit_number: unitNumber,
    unit_reference: unitNumber || null,
    equipment_category: equipmentCategory,
    category: equipmentCategory,
    make: optionalPlantText(normalizePayloadText(payload.make)),
    model: optionalPlantText(normalizePayloadText(payload.model)),
    serial_number: serialNumber,
    vin: serialNumber,
    current_hours: parseCurrentHours(payload.current_hours as string | number),
    next_service_hours: parseNextServiceHours(
      payload.next_service_hours as string | number
    ),
    last_service_date: lastServiceDate,
    service_history_date: lastServiceDate,
    service_history_doc_url: serviceHistoryUrl,
    service_history_url: serviceHistoryUrl,
    plant_risk_assessment_doc_url: riskAssessmentUrl,
    plant_risk_assessment_url: riskAssessmentUrl,
    risk_assessment_doc_url: riskAssessmentUrl,
    assigned_project_id: assignedProjectId,
    assigned_project_ids: assignedProjectId ? [assignedProjectId] : [],
    subcontractor_id: payload.subcontractor_id ?? null,
    is_subcontractor_plant: true,
    ownership_type: payload.ownership_type ?? "Subcontractor",
    status: payload.status ?? "Available",
    notes: noteFields.notes,
    comments: noteFields.comments,
    description: noteFields.description,
  };
}

export function getSubcontractorPlantCategory(plant: {
  equipment_category?: string | null;
  category?: string | null;
}): string | null {
  return optionalPlantText(plant.equipment_category ?? plant.category);
}

export function getSubcontractorPlantUnitReference(plant: {
  unit_reference?: string | null;
  unit_number?: string | null;
}): string {
  return trimText(plant.unit_reference ?? plant.unit_number);
}

export function getSubcontractorPlantSerialNumber(plant: {
  serial_number?: string | null;
  vin?: string | null;
}): string | null {
  return optionalPlantText(plant.serial_number ?? plant.vin);
}

export function getSubcontractorPlantServiceHistoryUrl(plant: {
  service_history_doc_url?: string | null;
  service_history_url?: string | null;
}): string | null {
  return (
    optionalPlantText(plant.service_history_doc_url) ??
    optionalPlantText(plant.service_history_url)
  );
}

export function getSubcontractorPlantRiskAssessmentUrl(plant: {
  plant_risk_assessment_doc_url?: string | null;
  plant_risk_assessment_url?: string | null;
  risk_assessment_doc_url?: string | null;
}): string | null {
  return (
    optionalPlantText(plant.plant_risk_assessment_doc_url) ??
    optionalPlantText(plant.plant_risk_assessment_url) ??
    optionalPlantText(plant.risk_assessment_doc_url)
  );
}

export function getSubcontractorPlantLastServiceDate(plant: {
  last_service_date?: string | null;
  service_history_date?: string | null;
}): string | null {
  return optionalPlantDate(
    plant.last_service_date ?? plant.service_history_date
  );
}
