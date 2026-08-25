import { supabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const BUCKET = "incident-attachments";

export async function uploadIncidentAttachment(
  file: File | Blob,
  path: string,
  contentType?: string
): Promise<{ url: string | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { url: null, error: "Supabase is not configured." };
  }

  try {
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      contentType: contentType || (file instanceof File ? file.type : undefined),
    });

    if (uploadError) {
      // Fallback to site-form-uploads if incident bucket is not provisioned yet.
      const fallback = await supabase.storage.from("site-form-uploads").upload(path, file, {
        upsert: true,
        contentType: contentType || (file instanceof File ? file.type : undefined),
      });
      if (fallback.error) {
        return { url: null, error: uploadError.message };
      }
      const { data } = supabase.storage.from("site-form-uploads").getPublicUrl(path);
      return { url: data.publicUrl, error: null };
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (cause) {
    return {
      url: null,
      error: cause instanceof Error ? cause.message : "Upload failed",
    };
  }
}

export async function uploadIncidentMedicalCertificate(
  file: File,
  incidentKey: string
): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `medical/${incidentKey}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { url, error } = await uploadIncidentAttachment(file, path, file.type);
  if (error) {
    console.warn("Medical certificate upload failed:", error);
    return null;
  }
  return url;
}

export async function uploadIncidentSignature(
  dataUrl: string,
  incidentKey: string
): Promise<string | null> {
  try {
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const file = new File([blob], "signature.png", { type: "image/png" });
    const path = `signatures/${incidentKey}/${Date.now()}.png`;
    const { url, error } = await uploadIncidentAttachment(file, path, "image/png");
    if (error) {
      console.warn("Incident signature upload failed:", error);
      return null;
    }
    return url;
  } catch (cause) {
    console.warn("Incident signature upload failed:", cause);
    return null;
  }
}
