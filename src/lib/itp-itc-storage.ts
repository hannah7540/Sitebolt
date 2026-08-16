import { supabase } from "./supabase";

export const ITP_ATTACHMENTS_BUCKET = "itp-attachments";
export const ITC_ATTACHMENTS_BUCKET = "itc-attachments";
export const ITP_SIGNATURES_BUCKET = "itp-signatures";
export const ITP_DRAWINGS_BUCKET = "itp-drawings";

/** Legacy bucket retained for backward compatibility when new buckets are missing. */
export const LEGACY_ITP_UPLOADS_BUCKET = "itp-uploads";

export function sanitizeStorageFileName(fileName: string): string {
  return (fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildUniqueStorageFileName(fileName: string): string {
  const safe = sanitizeStorageFileName(fileName);
  return `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${safe}`;
}

function isStorageBucketError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("bucket") ||
    lower.includes("not found") ||
    lower.includes("does not exist") ||
    lower.includes("invalid bucket") ||
    lower.includes("schema cache")
  );
}

export function logStorageUploadError(context: string, error: string): void {
  console.error(`[ITP/ITC storage] ${context}:`, error);
}

export async function uploadToStorageBucket(input: {
  bucket: string;
  pathPrefix: string;
  file: File | Blob;
  fileName: string;
  contentType?: string;
  fallbackBuckets?: string[];
}): Promise<{ url: string | null; error: string | null; bucketUsed: string | null }> {
  const buckets = [
    input.bucket,
    ...(input.fallbackBuckets ?? [LEGACY_ITP_UPLOADS_BUCKET]),
  ];
  const uniqueName = buildUniqueStorageFileName(input.fileName);
  const fullPath = `${input.pathPrefix.replace(/\/+$/, "")}/${uniqueName}`.replace(
    /\/+/g,
    "/"
  );

  let lastError = "Upload failed";

  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index];
    const isLast = index === buckets.length - 1;

    try {
      const { error } = await supabase.storage.from(bucket).upload(fullPath, input.file, {
        cacheControl: "3600",
        upsert: false,
        contentType: input.contentType || undefined,
      });

      if (error) {
        lastError = error.message;
        if (!isLast && isStorageBucketError(error.message)) {
          continue;
        }
        logStorageUploadError(`${bucket}/${fullPath}`, error.message);
        return { url: null, error: error.message, bucketUsed: null };
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(fullPath);
      return { url: data.publicUrl, error: null, bucketUsed: bucket };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Upload failed";
      if (!isLast && isStorageBucketError(lastError)) {
        continue;
      }
      logStorageUploadError(`${bucket}/${fullPath}`, lastError);
      return { url: null, error: lastError, bucketUsed: null };
    }
  }

  return { url: null, error: lastError, bucketUsed: null };
}

export async function uploadSignatureBlob(input: {
  pathPrefix: string;
  blob: Blob;
  fileName?: string;
}): Promise<{ url: string | null; error: string | null }> {
  const result = await uploadToStorageBucket({
    bucket: ITP_SIGNATURES_BUCKET,
    pathPrefix: input.pathPrefix,
    file: input.blob,
    fileName: input.fileName ?? "signature.png",
    contentType: "image/png",
  });
  return { url: result.url, error: result.error };
}
