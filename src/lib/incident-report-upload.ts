import { supabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const INCIDENT_ATTACHMENTS_BUCKET = "incident-attachments";

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

export async function uploadIncidentAttachment(
  file: File | Blob,
  path: string,
  contentType?: string
): Promise<{ url: string | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { url: null, error: "Supabase is not configured." };
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
      if (isBucketMissingError(message)) {
        return {
          url: null,
          error: `Could not upload to \`${INCIDENT_ATTACHMENTS_BUCKET}\`. Confirm the bucket exists and allows uploads, then retry.`,
        };
      }
      return {
        url: null,
        error: `Failed to upload to ${INCIDENT_ATTACHMENTS_BUCKET}: ${message}`,
      };
    }

    const { data } = supabase.storage
      .from(INCIDENT_ATTACHMENTS_BUCKET)
      .getPublicUrl(path);
    if (!data?.publicUrl) {
      return {
        url: null,
        error: `Upload succeeded but no public URL was returned from ${INCIDENT_ATTACHMENTS_BUCKET}.`,
      };
    }
    return { url: data.publicUrl, error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Upload failed";
    if (isBucketMissingError(message)) {
      return {
        url: null,
        error: `Could not upload to \`${INCIDENT_ATTACHMENTS_BUCKET}\`. Confirm the bucket exists and allows uploads, then retry.`,
      };
    }
    return { url: null, error: message };
  }
}

export async function uploadIncidentMedicalCertificate(
  file: File,
  incidentKey: string
): Promise<{ url: string | null; error: string | null }> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `medical/${incidentKey}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  return uploadIncidentAttachment(file, path, file.type || undefined);
}

export async function uploadIncidentSignature(
  dataUrl: string,
  incidentKey: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const file = new File([blob], "signature.png", { type: "image/png" });
    const path = `signatures/${incidentKey}/${Date.now()}.png`;
    return uploadIncidentAttachment(file, path, "image/png");
  } catch (cause) {
    return {
      url: null,
      error: cause instanceof Error ? cause.message : "Signature upload failed",
    };
  }
}
