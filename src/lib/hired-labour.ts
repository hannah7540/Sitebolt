import {
  addWorker,
  fetchWorkers,
  getWorkerAssignedProjectIds,
  supabase,
  type Worker,
} from "@/lib/supabase";
import { resolveActiveOrganisationId } from "@/lib/tenant-scope";
import { requestWorkerAuthInvite } from "@/lib/worker-invite-client";
import { uploadWorkerDocumentSafe } from "@/lib/worker-doc-upload";
import { DEFAULT_WORKER_SECURITY_ROLE } from "@/lib/security-roles";

export const HIRED_LABOUR_CATEGORY = "hired_labour";
export const INTERNAL_WORKER_CATEGORY = "internal";
export const HIRED_LABOUR_ONBOARDING_PATH = "/onboarding/hired-labour";
export const HIRED_LABOUR_DASHBOARD_PATH = "/dashboard";
export const HIRED_LABOUR_ADMIN_PATH = "/dashboard/subcontractors/hired-labour";

export type WorkerCategory = typeof INTERNAL_WORKER_CATEGORY | typeof HIRED_LABOUR_CATEGORY;

export function normalizeWorkerCategory(
  value: string | null | undefined
): WorkerCategory {
  return String(value ?? "").trim().toLowerCase() === HIRED_LABOUR_CATEGORY
    ? HIRED_LABOUR_CATEGORY
    : INTERNAL_WORKER_CATEGORY;
}

export function isHiredLabourWorker(
  worker: Pick<Worker, "worker_category"> | null | undefined
): boolean {
  return normalizeWorkerCategory(worker?.worker_category) === HIRED_LABOUR_CATEGORY;
}

export function hiredLabourOnboardingPath(): string {
  return HIRED_LABOUR_ONBOARDING_PATH;
}

export async function fetchHiredLabourWorkers(): Promise<Worker[]> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) return [];
  const workers = await fetchWorkers();
  return workers.filter(isHiredLabourWorker);
}

export async function createHiredLabourWorker(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): Promise<{ workerId: string | null; error: string | null; inviteError: string | null }> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) {
    return {
      workerId: null,
      error: "Select an organisation before adding hired labour.",
      inviteError: null,
    };
  }

  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim();
  const phone = input.phone.trim();

  if (!firstName || !lastName || !email || !phone) {
    return {
      workerId: null,
      error: "First name, last name, email, and contact number are required.",
      inviteError: null,
    };
  }

  const { workerId, error } = await addWorker({
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    organisation_id: orgId,
    worker_category: HIRED_LABOUR_CATEGORY,
    onboarding_completed: false,
    white_card_provided: false,
    silica_cert_provided: false,
    status: "pending_induction",
    security_role: DEFAULT_WORKER_SECURITY_ROLE,
    invite_status: "pending",
  });

  if (error || !workerId) {
    return { workerId: null, error: error ?? "Failed to create hired labour worker.", inviteError: null };
  }

  try {
    await requestWorkerAuthInvite(email, workerId, firstName, lastName);
    return { workerId, error: null, inviteError: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Failed to send invitation email.";
    return { workerId, error: null, inviteError: message };
  }
}

export async function completeHiredLabourOnboarding(input: {
  workerId: string;
  whiteCardProvided: boolean;
  silicaCertProvided: boolean;
  emergencyContactName: string;
  emergencyContactNumber: string;
  emergencyContactRelationship: string;
  whiteCardFile?: File | null;
  silicaCertFile?: File | null;
}): Promise<{ error: string | null }> {
  if (!input.whiteCardProvided || !input.silicaCertProvided) {
    return { error: "White Card and Silica certificate must both be provided." };
  }

  const emergencyContactName = input.emergencyContactName.trim();
  const emergencyContactNumber = input.emergencyContactNumber.trim();
  const emergencyContactRelationship = input.emergencyContactRelationship.trim();
  if (!emergencyContactName || !emergencyContactNumber || !emergencyContactRelationship) {
    return { error: "Emergency contact name, number, and relationship are required." };
  }

  const whiteCardUrl = await uploadWorkerDocumentSafe(
    input.whiteCardFile,
    `workers/${input.workerId}/white-card`
  );
  const silicaUrl = await uploadWorkerDocumentSafe(
    input.silicaCertFile,
    `workers/${input.workerId}/silica-cert`
  );

  const payload: Record<string, unknown> = {
    white_card_provided: true,
    silica_cert_provided: true,
    emergency_contact_name: emergencyContactName,
    emergency_contact_number: emergencyContactNumber,
    emergency_contact_phone: emergencyContactNumber,
    emergency_contact_relationship: emergencyContactRelationship,
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  };
  if (whiteCardUrl) {
    payload.white_card_doc_url = whiteCardUrl;
    payload.white_card_photo_url = whiteCardUrl;
  }
  if (silicaUrl) {
    payload.silica_cert_doc_url = silicaUrl;
    payload.silica_cert_photo_url = silicaUrl;
  }

  const orgId = resolveActiveOrganisationId();
  let updateQuery = supabase.from("workers").update(payload).eq("id", input.workerId);
  if (orgId) {
    updateQuery = updateQuery.eq("organisation_id", orgId);
  }
  let { error } = await updateQuery;
  if (error && /emergency_contact_number|white_card_provided|silica_cert_provided/i.test(error.message)) {
    const fallback = { ...payload };
    if (error.message.toLowerCase().includes("emergency_contact_number")) {
      delete fallback.emergency_contact_number;
    }
    if (error.message.toLowerCase().includes("white_card_provided")) {
      delete fallback.white_card_provided;
    }
    if (error.message.toLowerCase().includes("silica_cert_provided")) {
      delete fallback.silica_cert_provided;
    }
    let fallbackQuery = supabase.from("workers").update(fallback).eq("id", input.workerId);
    if (orgId) {
      fallbackQuery = fallbackQuery.eq("organisation_id", orgId);
    }
    ({ error } = await fallbackQuery);
  }

  if (error) {
    return { error: error.message };
  }
  return { error: null };
}

export function hiredLabourMatchesFilters(
  worker: Worker,
  options: { projectId?: string; state?: string }
): boolean {
  const projectId = options.projectId?.trim() ?? "";
  const state = options.state?.trim().toUpperCase() ?? "";
  if (projectId) {
    const assigned = getWorkerAssignedProjectIds(worker);
    if (!assigned.includes(projectId) && worker.assigned_project_id !== projectId) {
      return false;
    }
  }
  if (state && String(worker.state ?? "").trim().toUpperCase() !== state) {
    return false;
  }
  return true;
}

export function isUniformRequestForm(title: string | null | undefined): boolean {
  return /uniform/i.test(String(title ?? ""));
}
