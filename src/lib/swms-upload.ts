import { supabase } from "./supabase";

const SWMS_BUCKET = "swms-documents";

const SWMS_UPLOAD_FALLBACK_BUCKETS = [
  "site-form-uploads",
  "worker-documents",
  "worker-docs",
] as const;

/** Sanitize storage object keys for Supabase/S3 (no spaces or illegal characters). */
export function sanitizeStorageKey(rawName: string): string {
  const ext = rawName.split(".").pop() || "pdf";
  const base = rawName
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const safeBase = base || "document";
  return `swms-${Date.now()}-${safeBase}.${ext}`;
}

async function uploadSwmsPdfToBucket(
  bucket: string,
  file: File,
  fileKey: string
): Promise<{ url: string | null; error: string | null }> {
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(fileKey, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: "application/pdf",
    });

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    return { url: null, error: uploadError.message || "Failed to upload SWMS document" };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileKey);
  return { url: data.publicUrl, error: null };
}

export async function uploadSwmsPdf(
  file: File,
  path?: string
): Promise<{ url: string | null; error: string | null; bucket?: string; fileKey?: string }> {
  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");

  if (!isPdf) {
    return { url: null, error: "SWMS file must be a PDF." };
  }

  const fileKey = path?.trim() ? path.replace(/^\/+/, "") : sanitizeStorageKey(file.name);
  const bucketErrors: string[] = [];

  try {
    const primary = await uploadSwmsPdfToBucket(SWMS_BUCKET, file, fileKey);
    if (primary.url) {
      return { url: primary.url, error: null, bucket: SWMS_BUCKET, fileKey };
    }
    if (primary.error) {
      bucketErrors.push(`${SWMS_BUCKET}: ${primary.error}`);
    }

    for (const bucket of SWMS_UPLOAD_FALLBACK_BUCKETS) {
      try {
        const { url, error } = await uploadSwmsPdfToBucket(bucket, file, fileKey);
        if (url) {
          console.info(`SWMS PDF uploaded to fallback bucket "${bucket}": ${fileKey}`);
          return { url, error: null, bucket, fileKey };
        }

        const message = error ?? "Unknown storage error";
        bucketErrors.push(`${bucket}: ${message}`);
      } catch (bucketError) {
        const message =
          bucketError instanceof Error ? bucketError.message : "Upload failed";
        bucketErrors.push(`${bucket}: ${message}`);
      }
    }

    const combinedError =
      bucketErrors.length > 0
        ? `Storage upload failed. ${bucketErrors.join(" | ")}`
        : "Storage upload failed. No buckets are configured for SWMS uploads.";

    console.error("uploadSwmsPdf failed across all buckets:", combinedError);
    return { url: null, error: combinedError };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SWMS upload failed";
    console.error("uploadSwmsPdf failed:", error);
    return { url: null, error: message };
  }
}
