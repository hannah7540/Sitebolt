import { parseMissingColumnFromError, stripMissingColumn } from "./form-payload-utils";
import { HIRED_LABOUR_CATEGORY } from "./hired-labour";
import { DEFAULT_WORKER_SECURITY_ROLE } from "./security-roles";
import { setActiveOrganisationId } from "./active-organisation";
import { addWorker } from "./supabase";
import { supabase } from "./supabase/client";
import { buildWorkerFullName } from "./worker-utils";
import { requestWorkerAuthInvite } from "./worker-invite-client";

export type {
  SubcontractorPortalPlant,
  SubcontractorPortalWorker,
} from "./subcontractor-portal-models";

const PLANT_TABLES = ["plant", "plant_equipment", "subcontractor_plant"] as const;
const SUBCONTRACTOR_DOCS_BUCKET = "subcontractor-docs";

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function sanitizeFileName(fileName: string): string {
  const sanitized = fileName.trim().replace(/[^a-zA-Z0-9.-]/g, "_").replace(/_+/g, "_");
  return sanitized.replace(/^_+|_+$/g, "") || "document";
}

function parseHours(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number.parseFloat(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function uploadSubcontractorPortalPlantDocument(
  file: File | null | undefined,
  subcontractorId: string,
  kind: "last-service-report" | "plant-risk-assessment" | "operations-manual"
): Promise<{ url: string | null; error: string | null }> {
  if (!file) return { url: null, error: null };
  const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
  const path = `plant/${subcontractorId}/${kind}/${Date.now()}-${sanitizeFileName(file.name || `${kind}.${ext}`)}`;
  try {
    const { error } = await supabase.storage.from(SUBCONTRACTOR_DOCS_BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || (ext === "pdf" ? "application/pdf" : undefined),
    });
    if (error) {
      return { url: null, error: error.message };
    }
    const { data } = supabase.storage.from(SUBCONTRACTOR_DOCS_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (error) {
    return {
      url: null,
      error: error instanceof Error ? error.message : "Document upload failed.",
    };
  }
}

async function insertWithMissingColumnRetry(
  table: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  let current = { ...payload };
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { error } = await supabase.from(table).insert([current]);
    if (!error) return { error: null };
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in current) {
      current = stripMissingColumn(current, missing);
      continue;
    }
    return { error: error.message };
  }
  return { error: `Could not insert into ${table}.` };
}

export async function createSubcontractorPortalWorker(input: {
  subcontractorId: string;
  organisationId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  trade: string;
}): Promise<{ error: string | null; inviteError: string | null }> {
  const subcontractorId = input.subcontractorId.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();
  const trade = input.trade.trim();
  const organisationId = input.organisationId?.trim() || "";

  if (!subcontractorId) return { error: "Subcontractor profile is missing.", inviteError: null };
  if (!firstName || !lastName || !email || !phone || !trade) {
    return { error: "First name, last name, email, phone, and trade are required.", inviteError: null };
  }

  if (organisationId) {
    setActiveOrganisationId(organisationId);
  }

  const hiredLabourPayload = {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    trade,
    worker_type: trade,
    subcontractor_id: subcontractorId,
    is_subcontractor: true,
    worker_category: HIRED_LABOUR_CATEGORY,
    hired_labour_status: "invited" as const,
    onboarding_completed: false,
    white_card_provided: false,
    silica_cert_provided: false,
    status: "pending_induction" as const,
    security_role: DEFAULT_WORKER_SECURITY_ROLE,
    invite_status: "pending",
    ...(organisationId ? { organisation_id: organisationId } : {}),
  };

  let workerId: string | null = null;

  if (organisationId) {
    const created = await addWorker(hiredLabourPayload);
    if (created.error || !created.workerId) {
      return {
        error: created.error ?? "Failed to add worker.",
        inviteError: null,
      };
    }
    workerId = created.workerId;
  } else {
    const inserted = await insertWithMissingColumnRetry("workers", {
      ...hiredLabourPayload,
      full_name: buildWorkerFullName(firstName, lastName),
      worker_name: buildWorkerFullName(firstName, lastName),
    });
    if (inserted.error) return { error: inserted.error, inviteError: null };
    const { data } = await supabase
      .from("workers")
      .select("id")
      .eq("email", email)
      .eq("subcontractor_id", subcontractorId)
      .limit(1)
      .maybeSingle();
    workerId = data ? text((data as Record<string, unknown>).id) : null;
  }

  try {
    await requestWorkerAuthInvite(email, workerId ?? undefined, firstName, lastName);
    return { error: null, inviteError: null };
  } catch (cause) {
    return {
      error: null,
      inviteError:
        cause instanceof Error ? cause.message : "Worker saved, but the invite email could not be sent.",
    };
  }
}

export async function createSubcontractorPortalPlant(input: {
  subcontractorId: string;
  organisationId?: string;
  name: string;
  make: string;
  model: string;
  serialNumber: string;
  nextServiceDate: string;
  currentMachineHours?: string | number;
  nextServiceDueHours?: string | number;
  lastServiceReportUrl?: string | null;
  plantRiskAssessmentUrl?: string | null;
  operationsManualUrl?: string | null;
}): Promise<{ error: string | null }> {
  const subcontractorId = input.subcontractorId.trim();
  const name = input.name.trim();
  const make = input.make.trim();
  const model = input.model.trim();
  const serialNumber = input.serialNumber.trim();
  const nextServiceDate = input.nextServiceDate.trim();
  const organisationId = input.organisationId?.trim() || "";
  const currentMachineHours = parseHours(input.currentMachineHours);
  const nextServiceDueHours = parseHours(input.nextServiceDueHours);
  const lastServiceReportUrl = text(input.lastServiceReportUrl) || null;
  const plantRiskAssessmentUrl = text(input.plantRiskAssessmentUrl) || null;
  const operationsManualUrl = text(input.operationsManualUrl) || null;

  if (!subcontractorId) return { error: "Subcontractor profile is missing." };
  if (!name || !make || !model || !serialNumber || !nextServiceDate) {
    return { error: "Name/type, make, model, serial/rego, and next service date are required." };
  }

  const payload: Record<string, unknown> = {
    name,
    unit_number: name,
    unit_reference: name,
    plant_number: name,
    type: name,
    category: name,
    equipment_category: name,
    make,
    model,
    serial_number: serialNumber,
    vin: serialNumber,
    registration_code: serialNumber,
    rego: serialNumber,
    next_service_date: nextServiceDate,
    service_expiry: nextServiceDate,
    next_service_due: nextServiceDate,
    next_service_due_date: nextServiceDate,
    current_machine_hours: currentMachineHours,
    current_hours: currentMachineHours,
    next_service_due_hours: nextServiceDueHours,
    next_service_hours: nextServiceDueHours,
    last_service_report_url: lastServiceReportUrl,
    plant_risk_assessment_url: plantRiskAssessmentUrl,
    operations_manual_url: operationsManualUrl,
    subcontractor_id: subcontractorId,
    is_subcontractor_plant: true,
    ownership_type: "Subcontractor",
    status: "available",
  };
  if (organisationId) {
    payload.organisation_id = organisationId;
  }

  try {
    console.log("[subcontractor-portal-plant] Insert payload", payload);
    let lastError: string | null = null;
    for (const table of PLANT_TABLES) {
      const result = await insertWithMissingColumnRetry(table, payload);
      if (!result.error) return { error: null };
      lastError = result.error;
      console.error(`[subcontractor-portal-plant] ${table} insert failed`, result.error);
    }
    return { error: lastError ?? "Failed to save plant." };
  } catch (error) {
    console.error("[subcontractor-portal-plant] Insert threw", error);
    return {
      error: error instanceof Error ? error.message : "Failed to save plant.",
    };
  }
}
