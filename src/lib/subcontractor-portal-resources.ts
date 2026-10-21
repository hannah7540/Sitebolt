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

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
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
}): Promise<{ error: string | null }> {
  const subcontractorId = input.subcontractorId.trim();
  const name = input.name.trim();
  const make = input.make.trim();
  const model = input.model.trim();
  const serialNumber = input.serialNumber.trim();
  const nextServiceDate = input.nextServiceDate.trim();
  const organisationId = input.organisationId?.trim() || "";

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
    subcontractor_id: subcontractorId,
    is_subcontractor_plant: true,
    ownership_type: "Subcontractor",
    status: "available",
    ...(organisationId ? { organisation_id: organisationId } : {}),
  };

  let lastError: string | null = null;
  for (const table of PLANT_TABLES) {
    const result = await insertWithMissingColumnRetry(table, payload);
    if (!result.error) return { error: null };
    lastError = result.error;
  }

  return { error: lastError ?? "Failed to save plant." };
}
