import { supabase, isSupabaseConfigured } from "./supabase";
import { formatDateOnly } from "./scheduler-utils";

export type PlantServiceStatus = "Scheduled" | "Completed";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PlantServiceSchedule {
  id: string;
  plant_id: string | null;
  unit_number?: string | null;
  plant_name?: string | null;
  scheduled_date: string;
  service_date?: string | null;
  service_type: string;
  service_hours?: number | null;
  technician_notes: string | null;
  notes?: string | null;
  completed: boolean;
  status?: PlantServiceStatus | string | null;
  created_at?: string;
}

export interface CreatePlantServiceScheduleInput {
  plantId: string;
  unitNumber?: string | null;
  plantName?: string | null;
  serviceDate: string;
  targetHours?: number | null;
  serviceType?: string;
  notes?: string | null;
}

export interface UpdatePlantServiceScheduleInput {
  scheduleId: string;
  serviceDate?: string;
  serviceType?: string;
  notes?: string | null;
  targetHours?: number | null;
  unitNumber?: string | null;
  plantName?: string | null;
  completed?: boolean;
  status?: PlantServiceStatus;
}

const OPTIONAL_SERVICE_COLUMNS = [
  "unit_number",
  "plant_name",
  "service_date",
  "service_hours",
  "status",
  "notes",
  "technician_notes",
  "scheduled_date",
  "service_type",
  "completed",
  "plant_id",
] as const;

export function isValidUuid(value: string | null | undefined): boolean {
  return Boolean(value?.trim() && UUID_RE.test(value.trim()));
}

export function resolvePlantServiceDisplayName(input?: {
  name?: string | null;
  unit_number?: string | null;
  category?: string | null;
}): string {
  return (
    input?.name?.trim() ||
    input?.unit_number?.trim() ||
    input?.category?.trim() ||
    "Plant Equipment"
  );
}

function isMissingColumnError(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  const needle = column.toLowerCase();
  return (
    lower.includes(needle) &&
    (lower.includes("column") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
}

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  const needle = table.toLowerCase();
  return (
    lower.includes(needle) &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
}

function isPlantForeignKeyError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("foreign key") &&
    (lower.includes("plant_id") ||
      lower.includes("plant_service_schedules_plant_id"))
  );
}

function resolveNotesText(
  notes?: string | null,
  fallback = "Scheduled Plant Service"
): string {
  const trimmed = notes?.trim();
  return trimmed || fallback;
}

async function plantRecordExists(table: string, plantId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", plantId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error.message, table)) {
      return false;
    }
    console.warn(`resolveServicePlantId ${table} lookup failed:`, error.message);
    return false;
  }

  return Boolean(data?.id);
}

export async function resolveServicePlantId(
  plantId: string | null | undefined
): Promise<string | null> {
  const trimmed = plantId?.trim();
  if (!trimmed || !isValidUuid(trimmed)) {
    return null;
  }

  if (await plantRecordExists("plant", trimmed)) {
    return trimmed;
  }

  const existsInEquipment = await plantRecordExists("plant_equipment", trimmed);
  const existsInFleet = await plantRecordExists("organization_fleet", trimmed);

  if (existsInEquipment || existsInFleet) {
    return null;
  }

  return null;
}

function normalizePlantServiceSchedule(
  row: Record<string, unknown>
): PlantServiceSchedule {
  const scheduledDate = String(row.scheduled_date ?? row.service_date ?? "");
  const completed =
    row.completed === true ||
    String(row.status ?? "").toLowerCase() === "completed";
  const status =
    (row.status as PlantServiceStatus | undefined) ??
    (completed ? "Completed" : "Scheduled");

  return {
    id: String(row.id),
    plant_id: row.plant_id ? String(row.plant_id) : null,
    unit_number: row.unit_number ? String(row.unit_number) : null,
    plant_name: row.plant_name ? String(row.plant_name) : null,
    scheduled_date: scheduledDate,
    service_date: row.service_date ? String(row.service_date) : scheduledDate,
    service_type: String(row.service_type ?? "Scheduled Plant Service"),
    service_hours:
      row.service_hours == null || row.service_hours === undefined
        ? null
        : Number(row.service_hours),
    technician_notes: row.technician_notes
      ? String(row.technician_notes)
      : row.notes
        ? String(row.notes)
        : null,
    notes: row.notes
      ? String(row.notes)
      : row.technician_notes
        ? String(row.technician_notes)
        : null,
    completed,
    status,
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

async function buildSanitizedServicePayload(
  input: CreatePlantServiceScheduleInput
): Promise<Record<string, unknown>> {
  const notes = resolveNotesText(input.notes);
  const serviceType = input.serviceType?.trim() || "Scheduled Plant Service";
  const linkedPlantId = await resolveServicePlantId(input.plantId);

  const servicePayload = {
    plant_id: linkedPlantId,
    unit_number: input.unitNumber?.trim() || "Unit",
    plant_name: input.plantName?.trim() || "Plant Equipment",
    service_date: input.serviceDate,
    scheduled_date: input.serviceDate,
    service_hours: Number(input.targetHours) || 0,
    service_type: serviceType,
    completed: false,
    status: "Scheduled" as const,
    notes,
    technician_notes: notes,
  };

  return servicePayload;
}

async function buildLegacyCreatePayload(
  input: CreatePlantServiceScheduleInput
): Promise<Record<string, unknown>> {
  const notes = resolveNotesText(input.notes);
  const serviceType = input.serviceType?.trim() || "Scheduled Plant Service";
  const linkedPlantId = await resolveServicePlantId(input.plantId);

  const payload: Record<string, unknown> = {
    scheduled_date: input.serviceDate,
    service_type: serviceType,
    technician_notes: notes,
    completed: false,
    unit_number: input.unitNumber?.trim() || "Unit",
    plant_name: input.plantName?.trim() || "Plant Equipment",
  };

  if (linkedPlantId) {
    payload.plant_id = linkedPlantId;
  }

  return payload;
}

function buildUpdateServicePayload(input: UpdatePlantServiceScheduleInput) {
  const payload: Record<string, unknown> = {};

  if (input.serviceDate) {
    payload.service_date = input.serviceDate;
    payload.scheduled_date = input.serviceDate;
  }
  if (input.serviceType?.trim()) {
    payload.service_type = input.serviceType.trim();
  }
  if (input.targetHours !== undefined) {
    payload.service_hours = Number(input.targetHours) || 0;
  }
  if (input.unitNumber !== undefined) {
    payload.unit_number = input.unitNumber?.trim() || "Unit";
  }
  if (input.plantName !== undefined) {
    payload.plant_name = input.plantName?.trim() || "Plant Equipment";
  }
  if (input.notes !== undefined) {
    const notes = resolveNotesText(input.notes, "");
    payload.notes = notes || null;
    payload.technician_notes = notes || null;
  }
  if (input.completed !== undefined) {
    payload.completed = input.completed;
  }
  if (input.status) {
    payload.status = input.status;
  }

  return payload;
}

function remapNotesPayload(
  payload: Record<string, unknown>,
  mode: "notes-only" | "technician-notes-only"
): Record<string, unknown> {
  const notesText = String(payload.notes ?? payload.technician_notes ?? "");

  if (mode === "notes-only") {
    const { technician_notes: _ignored, ...rest } = payload;
    return { ...rest, notes: notesText || null };
  }

  const { notes: _ignored, ...rest } = payload;
  return { ...rest, technician_notes: notesText || null };
}

function stripMissingOptionalColumn(
  payload: Record<string, unknown>,
  column: string
): Record<string, unknown> {
  const next = { ...payload };
  delete next[column];
  return next;
}

async function mutateServiceScheduleWithFallback(
  mode: "insert" | "update",
  payload: Record<string, unknown>,
  scheduleId?: string
): Promise<{ error: string | null }> {
  let currentPayload = { ...payload };
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 12; attempt++) {
    const result =
      mode === "insert"
        ? await supabase.from("plant_service_schedules").insert([currentPayload])
        : await supabase
            .from("plant_service_schedules")
            .update(currentPayload)
            .eq("id", scheduleId!.trim());

    if (!result.error) {
      return { error: null };
    }

    lastError = result.error.message;

    if (isPlantForeignKeyError(lastError)) {
      currentPayload = { ...currentPayload, plant_id: null };
      continue;
    }

    if (isMissingColumnError(lastError, "technician_notes")) {
      currentPayload = remapNotesPayload(currentPayload, "notes-only");
      continue;
    }

    if (isMissingColumnError(lastError, "notes")) {
      currentPayload = remapNotesPayload(currentPayload, "technician-notes-only");
      continue;
    }

    const missingOptional = OPTIONAL_SERVICE_COLUMNS.find((column) =>
      isMissingColumnError(lastError!, column)
    );

    if (missingOptional) {
      currentPayload = stripMissingOptionalColumn(currentPayload, missingOptional);
      continue;
    }

    break;
  }

  return { error: lastError };
}

export async function fetchServiceSchedules(
  startDate: string,
  endDate: string
): Promise<PlantServiceSchedule[]> {
  try {
    if (!isSupabaseConfigured()) return [];

    let { data, error } = await supabase
      .from("plant_service_schedules")
      .select("*")
      .gte("scheduled_date", startDate)
      .lte("scheduled_date", endDate)
      .order("scheduled_date");

    if (
      error &&
      isMissingColumnError(error.message, "scheduled_date") &&
      !isMissingColumnError(error.message, "service_date")
    ) {
      ({ data, error } = await supabase
        .from("plant_service_schedules")
        .select("*")
        .gte("service_date", startDate)
        .lte("service_date", endDate)
        .order("service_date"));
    }

    if (error) {
      console.error("Failed to fetch service schedules:", error.message);
      return [];
    }

    return (data ?? []).map((row) =>
      normalizePlantServiceSchedule(row as Record<string, unknown>)
    );
  } catch (error) {
    console.error(
      "fetchServiceSchedules failed:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

/** Scheduled / incomplete service or maintenance (not yet completed). */
export function isActiveScheduledService(schedule: PlantServiceSchedule): boolean {
  if (schedule.completed) return false;
  const status = String(schedule.status ?? "").toLowerCase();
  return status !== "completed";
}

/** Canonical event date for a service row (prefer service_date). */
export function getPlantServiceEventDate(schedule: PlantServiceSchedule): string {
  return formatDateOnly(schedule.service_date ?? schedule.scheduled_date);
}

/** Header yellow badge: active/uncompleted and service date is today or later. */
export function isUpcomingHeaderBookedService(
  schedule: PlantServiceSchedule,
  todayIso?: string
): boolean {
  if (!isActiveScheduledService(schedule)) return false;
  const today = todayIso ?? formatDateOnly(new Date());
  const eventDate = getPlantServiceEventDate(schedule);
  if (!eventDate) return false;
  return eventDate >= today;
}

export function formatBookedServiceDate(dateStr: string | null | undefined): string {
  const normalized = formatDateOnly(dateStr);
  if (!normalized) return "TBC";
  const date = new Date(`${normalized}T12:00:00`);
  if (Number.isNaN(date.getTime())) return normalized;
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Upcoming active bookings from `plant_service_schedules` (status Scheduled / not completed). */
export async function fetchActivePlantServiceSchedules(
  fromDate?: string
): Promise<PlantServiceSchedule[]> {
  const today = fromDate ?? formatDateOnly(new Date());
  const rows = await fetchServiceSchedules(today, "2099-12-31");
  return rows.filter((row) => isUpcomingHeaderBookedService(row, today));
}

export interface BookedServicesByPlant {
  byPlantId: Map<string, PlantServiceSchedule>;
  byUnitNumber: Map<string, PlantServiceSchedule>;
}

/** Nearest upcoming booked service per plant (by id and unit number). */
export function indexBookedServicesByPlant(
  schedules: PlantServiceSchedule[],
  fromDate?: string
): BookedServicesByPlant {
  const start = fromDate ?? formatDateOnly(new Date());
  const byPlantId = new Map<string, PlantServiceSchedule>();
  const byUnitNumber = new Map<string, PlantServiceSchedule>();

  const sorted = [...schedules]
    .filter((row) => isUpcomingHeaderBookedService(row, start))
    .sort((a, b) =>
      getPlantServiceEventDate(a).localeCompare(getPlantServiceEventDate(b))
    );

  for (const schedule of sorted) {
    if (schedule.plant_id && !byPlantId.has(schedule.plant_id)) {
      byPlantId.set(schedule.plant_id, schedule);
    }
    const unit = schedule.unit_number?.trim().toLowerCase();
    if (unit && !byUnitNumber.has(unit)) {
      byUnitNumber.set(unit, schedule);
    }
  }

  return { byPlantId, byUnitNumber };
}

export function resolveBookedServiceForPlant(
  asset: { id: string; unit_number?: string | null },
  index: BookedServicesByPlant
): PlantServiceSchedule | undefined {
  return (
    index.byPlantId.get(asset.id) ??
    (asset.unit_number?.trim()
      ? index.byUnitNumber.get(asset.unit_number.trim().toLowerCase())
      : undefined)
  );
}

export async function createPlantServiceSchedule(
  input: CreatePlantServiceScheduleInput
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const fullResult = await mutateServiceScheduleWithFallback(
    "insert",
    await buildSanitizedServicePayload(input)
  );

  if (!fullResult.error) {
    return { error: null };
  }

  const legacyResult = await mutateServiceScheduleWithFallback(
    "insert",
    await buildLegacyCreatePayload(input)
  );

  return legacyResult;
}

export async function updatePlantServiceSchedule(
  input: UpdatePlantServiceScheduleInput
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  if (!input.scheduleId.trim()) {
    return { error: "Service schedule id is required." };
  }

  const payload = buildUpdateServicePayload(input);
  if (Object.keys(payload).length === 0) {
    return { error: "No service schedule fields to update." };
  }

  return mutateServiceScheduleWithFallback(
    "update",
    payload,
    input.scheduleId.trim()
  );
}

export async function completePlantServiceSchedule(
  scheduleId: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  if (!scheduleId.trim()) {
    return { error: "Service schedule id is required." };
  }

  let { error } = await supabase
    .from("plant_service_schedules")
    .update({ completed: true, status: "Completed" })
    .eq("id", scheduleId.trim());

  if (error && isMissingColumnError(error.message, "completed")) {
    ({ error } = await supabase
      .from("plant_service_schedules")
      .update({ status: "Completed" })
      .eq("id", scheduleId.trim()));
  } else if (error && isMissingColumnError(error.message, "status")) {
    ({ error } = await supabase
      .from("plant_service_schedules")
      .update({ completed: true })
      .eq("id", scheduleId.trim()));
  }

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

/** @deprecated Prefer createPlantServiceSchedule */
export async function logPlantServiceSchedule(input: {
  plantId: string;
  scheduledDate: string;
  serviceType: string;
  technicianNotes?: string;
  unitNumber?: string | null;
  plantName?: string | null;
  targetHours?: number | null;
}): Promise<{ error: string | null }> {
  return createPlantServiceSchedule({
    plantId: input.plantId,
    unitNumber: input.unitNumber,
    plantName: input.plantName,
    serviceDate: input.scheduledDate,
    targetHours: input.targetHours,
    serviceType: input.serviceType,
    notes: input.technicianNotes,
  });
}

export function buildPlantServiceCreateInput(
  plant: {
    id: string;
    unit_number?: string | null;
    name?: string | null;
    category?: string | null;
  },
  fields: {
    serviceDate: string;
    serviceType?: string;
    notes?: string | null;
    targetHours?: number | null;
  }
): CreatePlantServiceScheduleInput {
  return {
    plantId: plant.id,
    unitNumber: plant.unit_number ?? null,
    plantName: resolvePlantServiceDisplayName(plant),
    serviceDate: fields.serviceDate,
    serviceType: fields.serviceType,
    notes: fields.notes,
    targetHours: fields.targetHours,
  };
}
