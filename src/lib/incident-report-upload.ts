import { supabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const INCIDENT_ATTACHMENTS_BUCKET = "incident-attachments";

export type IncidentUploadResult = {
  url: string | null;
  error: string | null;
  usedFallback: boolean;
};

function isBucketMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("bucket") &&
    (lower.includes("not found") ||
      lower.includes("does not exist") ||
      lower.includes("not exist") ||
      lower.includes("404"))
  );
}

function isLikelyOffline(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine === false;
}

async function blobOrFileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string" && result.startsWith("data:")) {
        resolve(result);
        return;
      }
      reject(new Error("Could not encode attachment as data URL."));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read attachment for fallback."));
    reader.readAsDataURL(file);
  });
}

export async function uploadIncidentAttachment(
  file: File | Blob,
  path: string,
  contentType?: string
): Promise<IncidentUploadResult> {
  if (isLikelyOffline()) {
    try {
      const dataUrl = await blobOrFileToDataUrl(file);
      return { url: dataUrl, error: null, usedFallback: true };
    } catch (cause) {
      return {
        url: null,
        error: cause instanceof Error ? cause.message : "Offline fallback failed.",
        usedFallback: true,
      };
    }
  }

  if (!isSupabaseConfigured()) {
    try {
      const dataUrl = await blobOrFileToDataUrl(file);
      return { url: dataUrl, error: null, usedFallback: true };
    } catch {
      return { url: null, error: "Supabase is not configured.", usedFallback: false };
    }
  }

  try {
    const { error: uploadError } = await supabase.storage
      .from(INCIDENT_ATTACHMENTS_BUCKET)
      .upload(path, file, {
        upsert: true,
        contentType: contentType || (file instanceof File ? file.type : undefined),
      });

    if (uploadError) {
      const message = uploadError.message || "Upload failed";
      try {
        const dataUrl = await blobOrFileToDataUrl(file);
        return { url: dataUrl, error: null, usedFallback: true };
      } catch {
        if (isBucketMissingError(message)) {
          return {
            url: null,
            error: `Could not upload to \`${INCIDENT_ATTACHMENTS_BUCKET}\`. Confirm the bucket exists and allows uploads, then retry.`,
            usedFallback: false,
          };
        }
        return {
          url: null,
          error: `Failed to upload to ${INCIDENT_ATTACHMENTS_BUCKET}: ${message}`,
          usedFallback: false,
        };
      }
    }

    const { data } = supabase.storage
      .from(INCIDENT_ATTACHMENTS_BUCKET)
      .getPublicUrl(path);
    if (!data?.publicUrl) {
      try {
        const dataUrl = await blobOrFileToDataUrl(file);
        return { url: dataUrl, error: null, usedFallback: true };
      } catch {
        return {
          url: null,
          error: `Upload succeeded but no public URL was returned from ${INCIDENT_ATTACHMENTS_BUCKET}.`,
          usedFallback: false,
        };
      }
    }
    return { url: data.publicUrl, error: null, usedFallback: false };
  } catch (cause) {
    try {
      const dataUrl = await blobOrFileToDataUrl(file);
      return { url: dataUrl, error: null, usedFallback: true };
    } catch {
      const message = cause instanceof Error ? cause.message : "Upload failed";
      if (isBucketMissingError(message)) {
        return {
          url: null,
          error: `Could not upload to \`${INCIDENT_ATTACHMENTS_BUCKET}\`. Confirm the bucket exists and allows uploads, then retry.`,
          usedFallback: false,
        };
      }
      return { url: null, error: message, usedFallback: false };
    }
  }
}

export async function uploadIncidentMedicalCertificate(
  file: File,
  incidentKey: string
): Promise<IncidentUploadResult> {
  try {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `medical/${incidentKey}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    return await uploadIncidentAttachment(file, path, file.type || undefined);
  } catch (cause) {
    try {
      const dataUrl = await blobOrFileToDataUrl(file);
      return { url: dataUrl, error: null, usedFallback: true };
    } catch {
      return {
        url: null,
        error:
          cause instanceof Error ? cause.message : "Medical certificate upload failed",
        usedFallback: false,
      };
    }
  }
}

export async function uploadIncidentSignature(
  dataUrl: string,
  incidentKey: string
): Promise<IncidentUploadResult> {
  const safeDataUrl = typeof dataUrl === "string" ? dataUrl.trim() : "";
  if (!safeDataUrl.startsWith("data:")) {
    return {
      url: null,
      error: "Signature data is missing or invalid.",
      usedFallback: false,
    };
  }

  try {
    const blob = await fetch(safeDataUrl).then((r) => r.blob());
    const file = new File([blob], "signature.png", { type: "image/png" });
    const path = `signatures/${incidentKey}/${Date.now()}.png`;
    const result = await uploadIncidentAttachment(file, path, "image/png");
    if (result.url) return result;
    // Prefer original canvas data URL so submit never drops the signature.
    return { url: safeDataUrl, error: null, usedFallback: true };
  } catch {
    return { url: safeDataUrl, error: null, usedFallback: true };
  }
}
