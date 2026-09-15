import { supabase } from "./supabase";

export const ORGANIZATION_DOCUMENTS_BUCKET = "organization-documents";
export const ORGANIZATION_DOCUMENTS_FALLBACK_BUCKET = "documents";

const UPLOAD_BUCKETS = [
  ORGANIZATION_DOCUMENTS_BUCKET,
  ORGANIZATION_DOCUMENTS_FALLBACK_BUCKET,
] as const;

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim() || "document";
  const sanitized = trimmed.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/_+/g, "_");
  return sanitized.replace(/^_+|_+$/g, "") || "document";
}

export function buildOrganizationDocumentStoragePath(
  documentId: string,
  fileName: string
): string {
  const safeId = documentId.replace(/[^a-zA-Z0-9-]/g, "") || "document";
  return `org-docs/${safeId}/${Date.now()}_${sanitizeFileName(fileName)}`;
}

export function storagePathFromPublicUrl(
  url: string | null | undefined
): { bucket: string; path: string } | null {
  if (!url) return null;
  for (const bucket of UPLOAD_BUCKETS) {
    const marker = `/object/public/${bucket}/`;
    const index = url.indexOf(marker);
    if (index === -1) continue;
    const path = decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
    if (path) return { bucket, path };
  }
  return null;
}

export async function uploadOrganizationDocumentFile(
  file: File,
  documentId: string
): Promise<{ url: string | null; path: string | null; error: string | null }> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      url: null,
      path: null,
      error: "Document must be smaller than 20MB.",
    };
  }

  const path = buildOrganizationDocumentStoragePath(documentId, file.name);
  const errors: string[] = [];

  for (const bucket of UPLOAD_BUCKETS) {
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });

    if (uploadError) {
      errors.push(`[${bucket}] ${uploadError.message}`);
      continue;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl, path, error: null };
  }

  return {
    url: null,
    path: null,
    error: errors.join(" | ") || "Document upload failed.",
  };
}

export async function deleteOrganizationDocumentFile(
  fileUrl: string | null | undefined
): Promise<void> {
  const located = storagePathFromPublicUrl(fileUrl);
  if (!located) return;

  const { error } = await supabase.storage.from(located.bucket).remove([located.path]);
  if (error) {
    console.warn("Failed to delete organisation document from storage:", error.message);
  }
}
