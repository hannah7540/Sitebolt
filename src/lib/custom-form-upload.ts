import { supabase } from "./supabase";

export const FORM_ATTACHMENTS_BUCKET = "form-attachments";
const FALLBACK_BUCKETS = ["organization-documents", "documents"] as const;
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim() || "attachment";
  const sanitized = trimmed.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/_+/g, "_");
  return sanitized.replace(/^_+|_+$/g, "") || "attachment";
}

function buildStoragePath(submissionKey: string, fieldId: string, fileName: string): string {
  const safeKey = submissionKey.replace(/[^a-zA-Z0-9-]/g, "") || "draft";
  const safeField = fieldId.replace(/[^a-zA-Z0-9-]/g, "") || "field";
  return `${safeKey}/${safeField}/${Date.now()}_${sanitizeFileName(fileName)}`;
}

export async function uploadCustomFormAttachment(input: {
  file: File;
  submissionKey: string;
  fieldId: string;
}): Promise<{ url: string | null; error: string | null }> {
  if (input.file.size > MAX_FILE_SIZE_BYTES) {
    return { url: null, error: "File must be smaller than 20MB." };
  }

  const path = buildStoragePath(input.submissionKey, input.fieldId, input.file.name);
  const buckets = [FORM_ATTACHMENTS_BUCKET, ...FALLBACK_BUCKETS];
  const errors: string[] = [];

  for (const bucket of buckets) {
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, input.file, {
      upsert: true,
      contentType: input.file.type || undefined,
    });
    if (uploadError) {
      errors.push(`[${bucket}] ${uploadError.message}`);
      continue;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  }

  return {
    url: null,
    error: errors.join(" | ") || "Attachment upload failed.",
  };
}

export async function uploadSignatureDataUrl(
  dataUrl: string,
  submissionKey: string
): Promise<{ url: string | null; error: string | null }> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const file = new File([blob], "signature.png", { type: blob.type || "image/png" });
  return uploadCustomFormAttachment({
    file,
    submissionKey,
    fieldId: "signature",
  });
}
