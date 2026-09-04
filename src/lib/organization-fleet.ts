import { supabase, isSupabaseConfigured } from "./supabase";
import {
  nullIfBlankDate,
  parseMissingColumnFromError,
  sanitizeWritePayload,
  stripMissingColumn,
} from "./form-payload-utils";
import {
  isSupabaseMissingColumnError,
  isSupabaseRelationMissingError,
  isSupabaseSchemaCacheError,
  isSupabaseTableUnavailableError,
  isSupabaseZeroRowsError,
  toSupabaseRequestError,
} from "./supabase-errors";
import { getWorkerDisplayName } from "./worker-utils";
import type { Worker } from "./supabase";

const FLEET_TABLE = "organization_fleet";

const OPTIONAL_FLEET_COLUMNS = [
  "make",
  "model",
  "registration",
  "rego",
  "rego_expiry_date",
  "rego_document_url",
  "insurance_expiry_date",
  "insurance_document_url",
  "current_hours",
  "assigned_worker_id",
  "assigned_worker_name",
  "assigned_project_id",
  "assigned_project_name",
  "status",
  "updated_at",
] as const;

const FLEET_MISSING_TABLE_MESSAGE =
  "Fleet table is missing. Run migration 056_organization_fleet_and_documents.sql in Supabase.";

const FLEET_RLS_MESSAGE =
  "You don't have permission to save this fleet vehicle. Confirm INSERT/UPDATE policies on organization_fleet allow your signed-in user (run migration 146_organization_fleet_authenticated_access.sql).";

export const FLEET_REGO_REQUIRED_MESSAGE = "Registration / Rego is required";

export const FLEET_STATUSES = ["Active", "Maintenance", "Out of Service"] as const;

export type FleetStatus = (typeof FLEET_STATUSES)[number];

export type FleetDocumentType = "rego" | "insurance";

export interface OrganizationFleetVehicle {
  id: string;
  unit_number: string;
  make: string | null;
  model: string | null;
  registration: string | null;
  rego_expiry_date: string | null;
  rego_document_url: string | null;
  insurance_expiry_date: string | null;
  insurance_document_url: string | null;
  current_hours: number;
  assigned_worker_id: string | null;
  assigned_worker_name: string | null;
  assigned_project_id: string | null;
  assigned_project_name: string | null;
  status: FleetStatus | "archived";
  archived_at?: string | null;
  archived_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FleetVehicleInput {
  unitNumber: string;
  make?: string | null;
  model?: string | null;
  rego?: string | null;
  registration?: string | null;
  registration_number?: string | null;
  rego_number?: string | null;
  plate?: string | null;
  regoExpiryDate?: string | null;
  regoDocumentUrl?: string | null;
  insuranceExpiryDate?: string | null;
  insuranceDocumentUrl?: string | null;
  currentHours?: number;
  assignedWorkerId?: string | null;
  assignedWorkerName?: string | null;
  assignedProjectId?: string | null;
  assignedProjectName?: string | null;
  status?: FleetStatus;
}

function normalizeFleetRow(row: Record<string, unknown>): OrganizationFleetVehicle {
  return {
    id: String(row.id),
    unit_number: String(row.unit_number ?? ""),
    make: row.make ? String(row.make) : null,
    model: row.model ? String(row.model) : null,
    registration: firstNonEmptyText(
      row.registration,
      row.rego,
      row.registration_number,
      row.rego_number,
      row.plate
    ),
    rego_expiry_date: row.rego_expiry_date ? String(row.rego_expiry_date) : null,
    rego_document_url: row.rego_document_url ? String(row.rego_document_url) : null,
    insurance_expiry_date: row.insurance_expiry_date
      ? String(row.insurance_expiry_date)
      : null,
    insurance_document_url: row.insurance_document_url
      ? String(row.insurance_document_url)
      : null,
    current_hours: Number(row.current_hours ?? 0),
    assigned_worker_id: row.assigned_worker_id ? String(row.assigned_worker_id) : null,
    assigned_worker_name: row.assigned_worker_name
      ? String(row.assigned_worker_name)
      : null,
    assigned_project_id: row.assigned_project_id
      ? String(row.assigned_project_id)
      : null,
    assigned_project_name: row.assigned_project_name
      ? String(row.assigned_project_name)
      : null,
    status: normalizeFleetStatus(row.status),
    archived_at: row.archived_at ? String(row.archived_at) : null,
    archived_reason: row.archived_reason ? String(row.archived_reason) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function normalizeFleetStatus(value: unknown): FleetStatus | "archived" {
  const raw = String(value ?? "").trim();
  if (raw.toLowerCase() === "archived") return "archived";
  if (FLEET_STATUSES.includes(raw as FleetStatus)) return raw as FleetStatus;
  if (raw.toLowerCase() === "active") return "Active";
  return "Active";
}

function firstNonEmptyText(...values: unknown[]): string | null {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) return trimmed;
  }
  return null;
}

export function resolveFleetRego(
  input: Pick<
    FleetVehicleInput,
    "rego" | "registration" | "registration_number" | "rego_number" | "plate"
  >
): string {
  return (
    firstNonEmptyText(
      input.rego,
      input.registration,
      input.registration_number,
      input.rego_number,
      input.plate
    ) ?? ""
  );
}

function nullIfBlankUuid(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isFleetRlsError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const lower = String(error.message ?? "").toLowerCase();
  return (
    code === "42501" ||
    lower.includes("row-level security") ||
    lower.includes("permission denied") ||
    lower.includes("not authorized")
  );
}

function formatFleetWriteError(error: { message?: string; code?: string }): string {
  const normalized = toSupabaseRequestError({
    message: error.message ?? "",
    code: error.code ?? "",
    details: "",
    hint: "",
  });
  if (isFleetRlsError(error)) return FLEET_RLS_MESSAGE;
  const constraintMessage = `${error.message ?? ""} ${normalized?.details ?? ""}`.toLowerCase();
  if (
    (normalized?.code === "23502" || constraintMessage.includes("not-null constraint")) &&
    /(?<![a-z0-9_])rego(?![a-z0-9_])/.test(constraintMessage)
  ) {
    return FLEET_REGO_REQUIRED_MESSAGE;
  }
  if (isSupabaseMissingColumnError(normalized)) {
    return error.message || "Fleet table schema is missing a required column.";
  }
  if (
    isSupabaseRelationMissingError(normalized) ||
    (isSupabaseSchemaCacheError(normalized) && !isSupabaseMissingColumnError(normalized))
  ) {
    return FLEET_MISSING_TABLE_MESSAGE;
  }
  return error.message || "Failed to save fleet vehicle.";
}

function columnMentionedInError(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  const columnLower = column.toLowerCase();
  if (columnLower === "rego") {
    return (
      lower.includes("'rego'") ||
      lower.includes('"rego"') ||
      /(?<![a-z0-9_])rego(?![a-z0-9_])/.test(lower)
    );
  }
  return lower.includes(columnLower) || lower.includes(columnLower.replace(/_/g, " "));
}

function resolveOptionalFleetColumn(
  message: string,
  payload: Record<string, unknown>
): string | null {
  const parsed = parseMissingColumnFromError(message);
  if (parsed && parsed in payload) return parsed;
  return (
    OPTIONAL_FLEET_COLUMNS.find(
      (column) => column in payload && columnMentionedInError(message, column)
    ) ?? null
  );
}

function buildFleetPayload(input: FleetVehicleInput): Record<string, unknown> {
  const rego = resolveFleetRego(input);
  const payload: Record<string, unknown> = {
    unit_number: input.unitNumber.trim(),
    make: input.make?.trim() || null,
    model: input.model?.trim() || null,
    rego,
    registration: rego || null,
    rego_expiry_date: nullIfBlankDate(input.regoExpiryDate),
    rego_document_url: input.regoDocumentUrl ?? null,
    insurance_expiry_date: nullIfBlankDate(input.insuranceExpiryDate),
    insurance_document_url: input.insuranceDocumentUrl ?? null,
    current_hours: input.currentHours ?? 0,
    assigned_project_id: nullIfBlankUuid(input.assignedProjectId),
    assigned_project_name: input.assignedProjectName?.trim() || null,
    status: input.status ?? "Active",
    updated_at: new Date().toISOString(),
  };

  if (input.assignedWorkerId !== undefined) {
    payload.assigned_worker_id = nullIfBlankUuid(input.assignedWorkerId);
    payload.assigned_worker_name = input.assignedWorkerName?.trim() || null;
  }

  return sanitizeWritePayload(payload, {
    requiredTextKeys: ["unit_number", "rego"],
  });
}

async function fetchFleetVehicleById(
  id: string
): Promise<OrganizationFleetVehicle | null> {
  const { data, error } = await supabase
    .from(FLEET_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeFleetRow(data as Record<string, unknown>);
}

async function fetchLatestFleetVehicleByUnitNumber(
  unitNumber: string
): Promise<OrganizationFleetVehicle | null> {
  const { data, error } = await supabase
    .from(FLEET_TABLE)
    .select("*")
    .eq("unit_number", unitNumber)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeFleetRow(data as Record<string, unknown>);
}

async function writeFleetVehicle(input: {
  mode: "insert" | "update";
  id?: string;
  payload: Record<string, unknown>;
}): Promise<{ error: string | null; data: OrganizationFleetVehicle | null }> {
  let currentPayload = { ...input.payload };

  for (let attempt = 0; attempt <= OPTIONAL_FLEET_COLUMNS.length + 1; attempt += 1) {
    const query =
      input.mode === "insert"
        ? supabase.from(FLEET_TABLE).insert([currentPayload]).select("*").single()
        : supabase
            .from(FLEET_TABLE)
            .update(currentPayload)
            .eq("id", input.id ?? "")
            .select("*")
            .single();

    const { data, error } = await query;

    if (!error && data) {
      return { error: null, data: normalizeFleetRow(data as Record<string, unknown>) };
    }

    if (error && isSupabaseZeroRowsError(error)) {
      const recovered =
        input.mode === "update" && input.id
          ? await fetchFleetVehicleById(input.id)
          : await fetchLatestFleetVehicleByUnitNumber(
              String(currentPayload.unit_number ?? "")
            );
      if (recovered) return { error: null, data: recovered };
    }

    if (error && isSupabaseMissingColumnError(error)) {
      const missing = resolveOptionalFleetColumn(error.message, currentPayload);
      if (missing) {
        currentPayload = stripMissingColumn(currentPayload, missing);
        continue;
      }
    }

    if (error) {
      return { error: formatFleetWriteError(error), data: null };
    }
  }

  return { error: "Failed to save fleet vehicle.", data: null };
}

export async function fetchOrganizationFleet(): Promise<OrganizationFleetVehicle[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from(FLEET_TABLE)
    .select("*")
    .order("unit_number", { ascending: true });

  if (error) {
    if (
      !isSupabaseRelationMissingError(error) &&
      !isSupabaseTableUnavailableError(error, FLEET_TABLE)
    ) {
      console.error("Failed to fetch organization fleet:", error.message);
    }
    return [];
  }

  return (data ?? []).map((row) => normalizeFleetRow(row as Record<string, unknown>));
}

export async function insertOrganizationFleetVehicle(
  input: FleetVehicleInput
): Promise<{ error: string | null; data: OrganizationFleetVehicle | null }> {
  if (!input.unitNumber.trim()) {
    return { error: "Unit number is required.", data: null };
  }

  if (!resolveFleetRego(input)) {
    return { error: FLEET_REGO_REQUIRED_MESSAGE, data: null };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", data: null };
  }

  return writeFleetVehicle({
    mode: "insert",
    payload: buildFleetPayload(input),
  });
}

export async function updateOrganizationFleetVehicle(
  id: string,
  input: FleetVehicleInput
): Promise<{ error: string | null; data: OrganizationFleetVehicle | null }> {
  if (!id.trim()) {
    return { error: "Vehicle id is required.", data: null };
  }

  if (!resolveFleetRego(input)) {
    return { error: FLEET_REGO_REQUIRED_MESSAGE, data: null };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", data: null };
  }

  return writeFleetVehicle({
    mode: "update",
    id,
    payload: buildFleetPayload(input),
  });
}

function isActiveWorkerForFleetAssignment(worker: Worker): boolean {
  if (worker.is_revoked || worker.is_archived) return false;
  const status = String(worker.status ?? "active").toLowerCase();
  return status !== "revoked";
}

/** Active workers for fleet assignment dropdowns. */
export async function fetchActiveWorkersForFleetAssignment(): Promise<Worker[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from("workers")
    .select("id, first_name, last_name, full_name, worker_name, status, is_revoked, is_archived")
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true });

  if (error) {
    console.warn("Failed to fetch workers for fleet assignment:", error.message);
    return [];
  }

  return ((data ?? []) as Worker[]).filter(isActiveWorkerForFleetAssignment);
}

async function clearWorkerCompanyVehicleAssignment(
  workerId: string
): Promise<string | null> {
  const { error } = await supabase
    .from("workers")
    .update({
      has_company_vehicle: false,
      assigned_vehicle_asset_id: null,
    })
    .eq("id", workerId);

  return error?.message ?? null;
}

async function setWorkerCompanyVehicleAssignment(
  workerId: string,
  vehicleId: string
): Promise<string | null> {
  const { error } = await supabase
    .from("workers")
    .update({
      has_company_vehicle: true,
      assigned_vehicle_asset_id: vehicleId,
    })
    .eq("id", workerId);

  return error?.message ?? null;
}

/** Keep fleet vehicle assignment and worker company-vehicle fields in sync. */
export async function syncFleetVehicleWorkerAssignment(input: {
  vehicleId: string;
  previousWorkerId: string | null;
  nextWorkerId: string | null;
  nextWorkerName: string | null;
}): Promise<{ error: string | null }> {
  const previousId = input.previousWorkerId?.trim() || null;
  const nextId = input.nextWorkerId?.trim() || null;

  const assignResult = await writeFleetVehicle({
    mode: "update",
    id: input.vehicleId,
    payload: {
      assigned_worker_id: nextId,
      assigned_worker_name: nextId ? input.nextWorkerName?.trim() || null : null,
      updated_at: new Date().toISOString(),
    },
  });

  if (assignResult.error) {
    return { error: assignResult.error };
  }

  if (nextId) {
    const { error: detachError } = await supabase
      .from(FLEET_TABLE)
      .update({
        assigned_worker_id: null,
        assigned_worker_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq("assigned_worker_id", nextId)
      .neq("id", input.vehicleId);

    if (detachError) {
      return { error: formatFleetWriteError(detachError) };
    }
  }

  if (previousId && previousId !== nextId) {
    const clearError = await clearWorkerCompanyVehicleAssignment(previousId);
    if (clearError) return { error: clearError };
  }

  if (nextId) {
    const setError = await setWorkerCompanyVehicleAssignment(nextId, input.vehicleId);
    if (setError) return { error: setError };
  }

  return { error: null };
}

export function resolveFleetWorkerOptionLabel(worker: Worker): string {
  const first = worker.first_name?.trim() ?? "";
  const last = worker.last_name?.trim() ?? "";
  const combined = `${first} ${last}`.trim();
  return combined || getWorkerDisplayName(worker);
}

export async function updateFleetDocumentCompliance(input: {
  id: string;
  documentType: FleetDocumentType;
  expiryDate?: string | null;
  documentUrl?: string | null;
}): Promise<{ error: string | null; data: OrganizationFleetVehicle | null }> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.documentType === "rego") {
    if (input.expiryDate !== undefined) payload.rego_expiry_date = input.expiryDate;
    if (input.documentUrl !== undefined) payload.rego_document_url = input.documentUrl;
  } else {
    if (input.expiryDate !== undefined) {
      payload.insurance_expiry_date = input.expiryDate;
    }
    if (input.documentUrl !== undefined) {
      payload.insurance_document_url = input.documentUrl;
    }
  }

  return writeFleetVehicle({
    mode: "update",
    id: input.id,
    payload,
  });
}
