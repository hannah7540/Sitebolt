import { supabase, isSupabaseConfigured } from "./supabase";

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
  status: FleetStatus;
  created_at?: string;
  updated_at?: string;
}

export interface FleetVehicleInput {
  unitNumber: string;
  make?: string | null;
  model?: string | null;
  registration?: string | null;
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
    registration: row.registration ? String(row.registration) : null,
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
    status: (row.status as FleetStatus) ?? "Active",
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function buildFleetPayload(input: FleetVehicleInput): Record<string, unknown> {
  return {
    unit_number: input.unitNumber.trim(),
    make: input.make?.trim() || null,
    model: input.model?.trim() || null,
    registration: input.registration?.trim() || null,
    rego_expiry_date: input.regoExpiryDate || null,
    rego_document_url: input.regoDocumentUrl ?? null,
    insurance_expiry_date: input.insuranceExpiryDate || null,
    insurance_document_url: input.insuranceDocumentUrl ?? null,
    current_hours: input.currentHours ?? 0,
    assigned_worker_id: input.assignedWorkerId ?? null,
    assigned_worker_name: input.assignedWorkerName ?? null,
    assigned_project_id: input.assignedProjectId ?? null,
    assigned_project_name: input.assignedProjectName ?? null,
    status: input.status ?? "Active",
    updated_at: new Date().toISOString(),
  };
}

export async function fetchOrganizationFleet(): Promise<OrganizationFleetVehicle[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from("organization_fleet")
    .select("*")
    .order("unit_number", { ascending: true });

  if (error) {
    if (!error.message.toLowerCase().includes("organization_fleet")) {
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

  const { data, error } = await supabase
    .from("organization_fleet")
    .insert([buildFleetPayload(input)])
    .select("*")
    .single();

  if (error) {
    if (error.message.toLowerCase().includes("organization_fleet")) {
      return {
        error:
          "Fleet table is missing. Run migration 056_organization_fleet_and_documents.sql in Supabase.",
        data: null,
      };
    }
    return { error: error.message, data: null };
  }

  return { error: null, data: normalizeFleetRow(data as Record<string, unknown>) };
}

export async function updateOrganizationFleetVehicle(
  id: string,
  input: FleetVehicleInput
): Promise<{ error: string | null; data: OrganizationFleetVehicle | null }> {
  if (!id.trim()) {
    return { error: "Vehicle id is required.", data: null };
  }

  const { data, error } = await supabase
    .from("organization_fleet")
    .update(buildFleetPayload(input))
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  return { error: null, data: normalizeFleetRow(data as Record<string, unknown>) };
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

  const { data, error } = await supabase
    .from("organization_fleet")
    .update(payload)
    .eq("id", input.id)
    .select("*")
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  return { error: null, data: normalizeFleetRow(data as Record<string, unknown>) };
}
