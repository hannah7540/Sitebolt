import { supabase } from "./supabase";

const SWMS_UPLOAD_BUCKETS = [
  "site-form-uploads",
  "swms-documents",
  "worker-documents",
  "worker-docs",
] as const;

async function uploadSwmsPdfToBucket(
  bucket: string,
  file: File,
  path: string
): Promise<{ url: string | null; error: string | null }> {
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      upsert: true,
      contentType: "application/pdf",
    });

  if (uploadError) {
    return { url: null, error: uploadError.message };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export async function uploadSwmsPdf(
  file: File,
  path: string
): Promise<{ url: string | null; error: string | null; bucket?: string }> {
  const lowerName = file.name.toLowerCase();
  const isPdf =
    file.type === "application/pdf" || lowerName.endsWith(".pdf");

  if (!isPdf) {
    return { url: null, error: "SWMS file must be a PDF." };
  }

  const fullPath = path.includes(".pdf") ? path : `${path}.pdf`;
  const bucketErrors: string[] = [];

  try {
    for (const bucket of SWMS_UPLOAD_BUCKETS) {
      try {
        const { url, error } = await uploadSwmsPdfToBucket(bucket, file, fullPath);
        if (url) {
          console.info(`SWMS PDF uploaded to bucket "${bucket}": ${fullPath}`);
          return { url, error: null, bucket };
        }

        const message = error ?? "Unknown storage error";
        bucketErrors.push(`${bucket}: ${message}`);
        console.warn(`SWMS PDF upload failed for bucket "${bucket}":`, message);
      } catch (bucketError) {
        const message =
          bucketError instanceof Error ? bucketError.message : "Upload failed";
        bucketErrors.push(`${bucket}: ${message}`);
        console.warn(`SWMS PDF upload threw for bucket "${bucket}":`, bucketError);
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
