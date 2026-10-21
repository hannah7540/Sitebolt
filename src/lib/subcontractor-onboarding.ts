import { parseMissingColumnFromError, stripMissingColumn } from "./form-payload-utils";
import { insertSubcontractorDocument } from "./subcontractors";
import { isSupabaseConfigured, supabase } from "./supabase";
import { createSupabaseBrowserClient } from "./supabase/client";

export const SUBCONTRACTOR_DOCUMENTS_BUCKET = "subcontractor-documents";
export const SUBCONTRACTOR_DOCUMENTS_FALLBACK_BUCKET = "subcontractor-docs";
export const SUBCONTRACTOR_DASHBOARD_PATH = "/subcontractor/dashboard";

const UPLOAD_BUCKETS = [
  SUBCONTRACTOR_DOCUMENTS_BUCKET,
  SUBCONTRACTOR_DOCUMENTS_FALLBACK_BUCKET,
] as const;

export interface InvitedSubcontractor {
  id: string;
  company_name: string;
  email: string;
  contact_name: string;
}

function normalizeText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function fileExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  return /^[a-z0-9]{1,8}$/.test(fromName) ? fromName : "pdf";
}

function sanitizeFileName(fileName: string): string {
  const sanitized = fileName.trim().replace(/[^a-zA-Z0-9.-]/g, "_").replace(/_+/g, "_");
  return sanitized.replace(/^_+|_+$/g, "") || "document";
}

export async function fetchInvitedSubcontractorByEmail(
  email: string
): Promise<{ record: InvitedSubcontractor | null; error: string | null }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return { record: null, error: "This invite link is missing an email address." };
  }
  if (!isSupabaseConfigured()) {
    return { record: null, error: "Supabase is not configured." };
  }

  const select = "id, company_name, email, contact_email, contact_name, contact_person";
  const byEmail = await supabase
    .from("subcontractors")
    .select(select)
    .eq("email", normalized)
    .limit(1)
    .maybeSingle();

  let data = byEmail.data;
  let error = byEmail.error;

  if (!data) {
    const byContact = await supabase
      .from("subcontractors")
      .select(select)
      .eq("contact_email", normalized)
      .limit(1)
      .maybeSingle();
    if (byContact.data || !error) {
      data = byContact.data;
      error = byContact.error;
    }
  }

  if (error) {
    return { record: null, error: error.message };
  }
  if (!data) {
    return { record: null, error: "No invited subcontractor was found for this email." };
  }

  const row = data as Record<string, unknown>;
  return {
    record: {
      id: String(row.id ?? ""),
      company_name: normalizeText(row.company_name) || "your company",
      email: normalizeText(row.email) || normalizeText(row.contact_email) || normalized,
      contact_name: normalizeText(row.contact_name) || normalizeText(row.contact_person),
    },
    error: null,
  };
}

export async function uploadSubcontractorInsuranceDocument(
  file: File,
  subcontractorId: string,
  kind: "pl" | "pi"
): Promise<{ url: string | null; error: string | null }> {
  const ext = fileExtension(file);
  const path = `${subcontractorId}/${kind}/${Date.now()}-${sanitizeFileName(file.name || `${kind}.${ext}`)}`;
  const errors: string[] = [];

  for (const bucket of UPLOAD_BUCKETS) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || (ext === "pdf" ? "application/pdf" : undefined),
    });
    if (error) {
      errors.push(`[${bucket}] ${error.message}`);
      continue;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  }

  return {
    url: null,
    error: errors.join(" | ") || "Insurance document upload failed.",
  };
}

async function updateSubcontractorWithColumnRetry(
  id: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  let current = { ...payload };
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await supabase.from("subcontractors").update(current).eq("id", id);
    if (!error) return { error: null };
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in current) {
      current = stripMissingColumn(current, missing);
      continue;
    }
    return { error: error.message };
  }
  return { error: "Could not update subcontractor details." };
}

export async function completeSubcontractorOnboarding(input: {
  email: string;
  password: string;
  address: string;
  abn: string;
  plExpiry: string;
  plValue: string;
  plFile: File | null;
  piExpiry: string;
  piValue: string;
  piFile: File | null;
}): Promise<{ error: string | null }> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const address = input.address.trim();
  const abn = input.abn.trim();
  const plExpiry = input.plExpiry.trim();
  const plValue = input.plValue.trim();
  const piExpiry = input.piExpiry.trim();
  const piValue = input.piValue.trim();

  if (!email) return { error: "This invite link is missing an email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (!address) return { error: "Full address is required." };
  if (!abn) return { error: "ABN is required." };
  if (!plExpiry || !plValue || !input.plFile) {
    return { error: "Public Liability expiry, policy value, and document are required." };
  }
  if (!piExpiry || !piValue || !input.piFile) {
    return { error: "Professional Indemnity expiry, policy value, and document are required." };
  }

  const invited = await fetchInvitedSubcontractorByEmail(email);
  if (invited.error || !invited.record?.id) {
    return { error: invited.error ?? "Invite not found." };
  }

  const client = createSupabaseBrowserClient();
  let userId: string | null = null;

  const signedUp = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: "subcontractor",
        company_name: invited.record.company_name,
      },
    },
  });

  if (signedUp.error) {
    const alreadyRegistered = /already registered|already exists|user already/i.test(
      signedUp.error.message
    );
    if (!alreadyRegistered) {
      return { error: signedUp.error.message };
    }
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.user) {
      return { error: signedIn.error?.message ?? "Could not sign in with that password." };
    }
    userId = signedIn.data.user.id;
  } else {
    userId = signedUp.data.user?.id ?? null;
    if (!userId) {
      const signedIn = await client.auth.signInWithPassword({ email, password });
      userId = signedIn.data.user?.id ?? null;
    }
  }

  const plUpload = await uploadSubcontractorInsuranceDocument(
    input.plFile,
    invited.record.id,
    "pl"
  );
  if (plUpload.error || !plUpload.url) {
    return { error: plUpload.error ?? "Failed to upload Public Liability document." };
  }

  const piUpload = await uploadSubcontractorInsuranceDocument(
    input.piFile,
    invited.record.id,
    "pi"
  );
  if (piUpload.error || !piUpload.url) {
    return { error: piUpload.error ?? "Failed to upload Professional Indemnity document." };
  }

  const updatePayload: Record<string, unknown> = {
    address,
    abn,
    status: "active",
    public_liability_expiry: plExpiry,
    public_liability_value: plValue,
    public_liability_policy_value: plValue,
    public_liability_document_url: plUpload.url,
    pl_expiry: plExpiry,
    pl_policy_value: plValue,
    pl_document_url: plUpload.url,
    professional_indemnity_expiry: piExpiry,
    professional_indemnity_value: piValue,
    professional_indemnity_document_url: piUpload.url,
    pi_expiry: piExpiry,
    pi_policy_value: piValue,
    pi_document_url: piUpload.url,
    updated_at: new Date().toISOString(),
  };
  if (userId) {
    updatePayload.user_id = userId;
    updatePayload.auth_user_id = userId;
  }

  const update = await updateSubcontractorWithColumnRetry(invited.record.id, updatePayload);
  if (update.error) return { error: update.error };

  await insertSubcontractorDocument({
    subcontractorId: invited.record.id,
    documentType: "public_liability",
    title: `Public Liability — ${plValue}`,
    expiryDate: plExpiry,
    documentUrl: plUpload.url,
  });
  await insertSubcontractorDocument({
    subcontractorId: invited.record.id,
    documentType: "professional_indemnity",
    title: `Professional Indemnity — ${piValue}`,
    expiryDate: piExpiry,
    documentUrl: piUpload.url,
  });

  return { error: null };
}
