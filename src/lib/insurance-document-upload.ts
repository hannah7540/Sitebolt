import { supabase } from "./supabase";

export const ORGANISATION_INSURANCE_BUCKET = "organisation-insurances";
export const COMPANY_INSURANCE_BUCKET = "company-insurances";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".docx"];
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

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
  fileName: string
): Promise<{ url: string | null; error: string | null }> {
  const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, file, {
    upsert: true,
    contentType: file.type || undefined,
  });

  if (uploadError) {
    return { url: null, error: uploadError.message };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return { url: data.publicUrl, error: null };
}

export async function uploadInsuranceDocument(file: File): Promise<{
  url: string | null;
  fileName: string | null;
  error: string | null;
}> {
  const validationError = validateInsuranceDocumentFile(file);
  if (validationError) {
    return { url: null, fileName: null, error: validationError };
  }

  const safeBase = file.name.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
  const storageName = `${Date.now()}-${safeBase || "policy-document"}`;

  try {
    const primary = await uploadToBucket(ORGANISATION_INSURANCE_BUCKET, file, storageName);
    if (primary.url) {
      return { url: primary.url, fileName: file.name, error: null };
    }

    const fallback = await uploadToBucket(COMPANY_INSURANCE_BUCKET, file, storageName);
    if (fallback.url) {
      return { url: fallback.url, fileName: file.name, error: null };
    }

    return {
      url: null,
      fileName: null,
      error: primary.error ?? fallback.error ?? "Insurance document upload failed.",
    };
  } catch (err) {
    return {
      url: null,
      fileName: null,
      error: err instanceof Error ? err.message : "Insurance document upload failed.",
    };
  }
}
