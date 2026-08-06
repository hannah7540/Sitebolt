import { supabase } from "./supabase";

const BUCKET = "fleet-uploads";

export async function uploadFleetDocument(
  file: File,
  fleetId: string,
  documentType: "rego" | "insurance"
): Promise<{ url: string | null; error: string | null }> {
  try {
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const path = `${fleetId}/${documentType}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (error) {
    return {
      url: null,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}
