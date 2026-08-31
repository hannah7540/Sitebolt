import { supabase, isSupabaseConfigured } from "./supabase";

export const ASSET_DOCUMENTS_BUCKET = "asset-documents";

export type AssetCertificateKind = "service" | "calibration";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export function validateAssetCertificateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "Certificate must be smaller than 20MB.";
  }

  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const hasAllowedMime = file.type ? ALLOWED_MIME_TYPES.has(file.type) : false;

  if (!hasAllowedExtension && !hasAllowedMime) {
    return "Please upload a PDF or image file (PNG, JPG, WEBP).";
  }

  return null;
}

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim() || "certificate";
  const sanitized = trimmed.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/_+/g, "_");
  return sanitized.replace(/^_+|_+$/g, "") || "certificate";
}

export function buildAssetCertificatePath(
  assetId: string,
  kind: AssetCertificateKind,
  fileName: string
): string {
  const safeAssetId = assetId.replace(/[^a-zA-Z0-9-]/g, "") || "asset";
  return `${safeAssetId}/${kind}-${Date.now()}-${sanitizeFileName(fileName)}`;
}

export async function uploadAssetCertificate(
  file: File,
  assetId: string,
  kind: AssetCertificateKind
): Promise<{ url: string | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { url: null, error: "Supabase is not configured" };
  }

  const validationError = validateAssetCertificateFile(file);
  if (validationError) {
    return { url: null, error: validationError };
  }

  try {
    const path = buildAssetCertificatePath(assetId, kind, file.name);
    const { error: uploadError } = await supabase.storage
      .from(ASSET_DOCUMENTS_BUCKET)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = supabase.storage.from(ASSET_DOCUMENTS_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl || null, error: data.publicUrl ? null : "Failed to create public URL." };
  } catch (error) {
    return {
      url: null,
      error: error instanceof Error ? error.message : "Certificate upload failed.",
    };
  }
}
