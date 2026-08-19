import { supabase } from "./supabase";
import type { InsuranceDocumentAttachment } from "./insurance-utils";

export const ORGANISATION_INSURANCE_BUCKET = "organisation-insurances";
export const COMPANY_INSURANCE_BUCKET = "company-insurances";

/** Preferred public buckets — tried in order until one succeeds. */
export const INSURANCE_UPLOAD_BUCKETS = [
  "insurances",
  "documents",
  ORGANISATION_INSURANCE_BUCKET,
  COMPANY_INSURANCE_BUCKET,
] as const;

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".docx"];
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function sanitizeInsuranceStorageFileName(fileName: string): string {
  const trimmed = fileName.trim() || "policy-document";
  const sanitized = trimmed.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/_+/g, "_");
  return sanitized.replace(/^_+|_+$/g, "") || "policy-document";
}

export function buildInsuranceStorageObjectKey(
  companyId: string,
  fileName: string
): string {
  const safeCompanyId = companyId.replace(/[^a-zA-Z0-9-]/g, "") || "organisation";
  const safeFileName = sanitizeInsuranceStorageFileName(fileName);
  return `${safeCompanyId}/${Date.now()}_${safeFileName}`;
}

export async function resolveInsuranceStorageCompanyId(): Promise<string> {
  try {
    const { loadCompanyProfile, DEFAULT_COMPANY_PROFILE_ID } = await import(
      "./company-profile-service"
    );
    const profile = await loadCompanyProfile();
    return profile?.id?.trim() || DEFAULT_COMPANY_PROFILE_ID;
  } catch {
    const { DEFAULT_COMPANY_PROFILE_ID } = await import("./company-profile-service");
    return DEFAULT_COMPANY_PROFILE_ID;
  }
}

export function validateInsuranceDocumentFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "Insurance document must be smaller than 20MB.";
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const hasAllowedMime = file.type ? ALLOWED_MIME_TYPES.has(file.type) : false;

  if (!hasAllowedExtension && !hasAllowedMime) {
    return "Please upload a PDF, PNG, JPG, JPEG, or DOCX file.";
  }

  return null;
}

async function uploadToBucket(
  bucket: string,
  file: File,
  objectKey: string
): Promise<{ url: string | null; error: string | null }> {
  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectKey, file, {
    upsert: true,
    contentType: file.type || undefined,
  });

  if (uploadError) {
    return {
      url: null,
      error: `[${bucket}] ${uploadError.message}`,
    };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectKey);
  return { url: data.publicUrl, error: null };
}

export async function uploadInsuranceDocument(
  file: File,
  companyId?: string
): Promise<{
  url: string | null;
  fileName: string | null;
  size: number;
  error: string | null;
}> {
  const validationError = validateInsuranceDocumentFile(file);
  if (validationError) {
    return { url: null, fileName: null, size: file.size, error: validationError };
  }

  const resolvedCompanyId = companyId ?? (await resolveInsuranceStorageCompanyId());
  const objectKey = buildInsuranceStorageObjectKey(resolvedCompanyId, file.name);
  const errors: string[] = [];

  try {
    for (const bucket of INSURANCE_UPLOAD_BUCKETS) {
      const attempt = await uploadToBucket(bucket, file, objectKey);
      if (attempt.url) {
        return {
          url: attempt.url,
          fileName: file.name,
          size: file.size,
          error: null,
        };
      }
      if (attempt.error) {
        errors.push(attempt.error);
      }
    }

    return {
      url: null,
      fileName: null,
      size: file.size,
      error: errors.join(" | ") || "Insurance document upload failed.",
    };
  } catch (err) {
    return {
      url: null,
      fileName: null,
      size: file.size,
      error: err instanceof Error ? err.message : "Insurance document upload failed.",
    };
  }
}

export async function uploadInsuranceDocuments(files: File[]): Promise<{
  documents: InsuranceDocumentAttachment[];
  errors: string[];
}> {
  if (files.length === 0) {
    return { documents: [], errors: [] };
  }

  const companyId = await resolveInsuranceStorageCompanyId();
  const results = await Promise.all(
    files.map((file) => uploadInsuranceDocument(file, companyId))
  );
  const documents: InsuranceDocumentAttachment[] = [];
  const errors: string[] = [];
  const uploadedAt = new Date().toISOString();

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const sourceFile = files[index];
    if (result.error || !result.url) {
      const label = sourceFile?.name ? `${sourceFile.name}: ` : "";
      errors.push(`${label}${result.error ?? "Upload failed."}`);
      continue;
    }
    documents.push({
      name: result.fileName ?? sourceFile?.name ?? "Policy document",
      url: result.url,
      uploaded_at: uploadedAt,
      size: result.size,
    });
  }

  return { documents, errors };
}
