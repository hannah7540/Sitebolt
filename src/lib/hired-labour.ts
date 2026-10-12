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
import { browserAuthHeaders } from "@/lib/browser-auth-headers";
import { normalizeWorkerStateRegion } from "@/lib/worker-state-region";
import {
  resolveHiredLabourAccessStatus,
  type HiredLabourStatus,
} from "@/lib/hired-labour-status";

export type { HiredLabourStatus } from "@/lib/hired-labour-status";
export {
  hiredLabourCanAccessApp,
  normalizeHiredLabourStatus,
  resolveHiredLabourAccessStatus,
} from "@/lib/hired-labour-status";

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

export type HiredLabourRecord = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  worker_name: string | null;
  email: string | null;
  phone: string | null;
  state: string | null;
  assigned_project_id: string | null;
  assigned_project_ids: string[] | null;
  hired_labour_status: HiredLabourStatus;
  onboarding_completed: boolean;
  white_card_number: string | null;
  white_card_date: string | null;
  white_card_file_url: string | null;
  silica_cert_number: string | null;
  silica_cert_date: string | null;
  silica_cert_file_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  emergency_contact_relationship: string | null;
  rejection_notes: string | null;
  auth_user_id: string | null;
};

const HIRED_LABOUR_LIST_SELECT = [
  "id",
  "first_name",
  "last_name",
  "full_name",
  "worker_name",
  "email",
  "phone",
  "state",
  "assigned_project_id",
  "assigned_project_ids",
  "hired_labour_status",
  "onboarding_completed",
  "white_card_number",
  "white_card_date",
  "white_card_file_url",
  "white_card_issue_date",
  "white_card_doc_url",
  "silica_cert_number",
  "silica_cert_date",
  "silica_cert_file_url",
  "silica_cert_issue_date",
  "silica_cert_doc_url",
  "emergency_contact_name",
  "emergency_contact_number",
  "emergency_contact_phone",
  "emergency_contact_relationship",
  "rejection_notes",
  "auth_user_id",
].join(", ");

function text(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function mapHiredLabourRow(row: Record<string, unknown>): HiredLabourRecord {
  const projectIds = Array.isArray(row.assigned_project_ids)
    ? row.assigned_project_ids.map((id) => String(id)).filter(Boolean)
    : null;
  return {
    id: String(row.id),
    first_name: text(row.first_name),
    last_name: text(row.last_name),
    full_name: text(row.full_name),
    worker_name: text(row.worker_name),
    email: text(row.email),
    phone: text(row.phone),
    state: text(row.state),
    assigned_project_id: text(row.assigned_project_id),
    assigned_project_ids: projectIds,
    hired_labour_status: resolveHiredLabourAccessStatus(
      text(row.hired_labour_status),
      row.onboarding_completed === true
    ),
    onboarding_completed: row.onboarding_completed === true,
    white_card_number: text(row.white_card_number),
    white_card_date: text(row.white_card_date) ?? text(row.white_card_issue_date),
    white_card_file_url: text(row.white_card_file_url) ?? text(row.white_card_doc_url),
    silica_cert_number: text(row.silica_cert_number),
    silica_cert_date: text(row.silica_cert_date) ?? text(row.silica_cert_issue_date),
    silica_cert_file_url: text(row.silica_cert_file_url) ?? text(row.silica_cert_doc_url),
    emergency_contact_name: text(row.emergency_contact_name),
    emergency_contact_number:
      text(row.emergency_contact_number) ?? text(row.emergency_contact_phone),
    emergency_contact_relationship: text(row.emergency_contact_relationship),
    rejection_notes: text(row.rejection_notes),
    auth_user_id: text(row.auth_user_id),
  };
}

export async function fetchHiredLabourRecords(): Promise<HiredLabourRecord[]> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) return [];
  const { data, error } = await supabase
    .from("workers")
    .select(HIRED_LABOUR_LIST_SELECT)
    .eq("organisation_id", orgId)
    .eq("worker_category", HIRED_LABOUR_CATEGORY)
    .limit(500);
  if (error) {
    console.warn("[hired-labour] list failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => mapHiredLabourRow(row as unknown as Record<string, unknown>));
}

export async function fetchHiredLabourAccess(workerId: string): Promise<HiredLabourStatus> {
  const { data, error } = await supabase
    .from("workers")
    .select("hired_labour_status, onboarding_completed, worker_category")
    .eq("id", workerId)
    .maybeSingle();
  if (error && /hired_labour_status/i.test(error.message)) {
    const fallback = await supabase
      .from("workers")
      .select("worker_category, onboarding_completed")
      .eq("id", workerId)
      .maybeSingle();
    if (fallback.error || !fallback.data) return "invited";
    const row = fallback.data as {
      worker_category?: string | null;
      onboarding_completed?: boolean | null;
    };
    if (String(row.worker_category ?? "").trim().toLowerCase() !== HIRED_LABOUR_CATEGORY) {
      return "approved";
    }
    return resolveHiredLabourAccessStatus(null, row.onboarding_completed);
  }
  if (error || !data) return "invited";
  const row = data as {
    hired_labour_status?: string | null;
    onboarding_completed?: boolean | null;
    worker_category?: string | null;
  };
  if (String(row.worker_category ?? "").trim().toLowerCase() !== HIRED_LABOUR_CATEGORY) {
    return "approved";
  }
  return resolveHiredLabourAccessStatus(row.hired_labour_status, row.onboarding_completed);
}

function hiredLabourDocumentExtension(file: File): string {
  const fromName = file.name.includes(".")
    ? (file.name.split(".").pop() ?? "").toLowerCase()
    : "";
  if (fromName === "jpeg" || fromName === "jpg") return "jpg";
  if (["png", "webp", "gif", "heic", "heif", "pdf"].includes(fromName)) return fromName;
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  if (file.type === "image/heic" || file.type === "image/heif") return "heic";
  return "jpg";
}

function hiredLabourDocumentContentType(file: File, extension: string): string {
  if (file.type) return file.type;
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "heic" || extension === "heif") return "image/heic";
  return "image/jpeg";
}

export async function uploadHiredLabourDocument(
  file: File,
  path: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const extension = hiredLabourDocumentExtension(file);
    const fullPath = path.includes(".") ? path : `${path}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("worker_documents")
      .upload(fullPath, file, {
        upsert: true,
        contentType: hiredLabourDocumentContentType(file, extension),
      });
    if (uploadError) return { url: null, error: uploadError.message };
    const { data } = supabase.storage.from("worker_documents").getPublicUrl(fullPath);
    return { url: data.publicUrl, error: null };
  } catch (cause) {
    return {
      url: null,
      error: cause instanceof Error ? cause.message : "Upload failed.",
    };
  }
}

export async function mutateHiredLabour(
  body: Record<string, unknown>
): Promise<{ error: string | null }> {
  const headers = await browserAuthHeaders();
  const response = await fetch("/api/workers/hired-labour", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers,
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    return { error: payload?.error ?? "Hired labour update failed." };
  }
  return { error: null };
}

export async function createHiredLabourWorker(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  projectId: string;
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
  const state = normalizeWorkerStateRegion(input.state);
  const projectId = input.projectId.trim();

  if (!firstName || !lastName || !email || !phone || !state || !projectId) {
    return {
      workerId: null,
      error: "Name, email, phone, state, and project are required.",
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
    hired_labour_status: "invited",
    state,
    assigned_project_id: projectId,
    assigned_project_ids: [projectId],
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
