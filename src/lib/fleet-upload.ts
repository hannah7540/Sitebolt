import { supabase } from "./supabase";

export const FLEET_DOCUMENTS_BUCKET = "plant-documents";

export async function uploadFleetDocument(
  file: File,
  fleetId: string,
  documentType: "rego" | "insurance"
): Promise<{ url: string | null; error: string | null }> {
  try {
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const path = `fleet/${fleetId}/${documentType}-${Date.now()}.${ext}`;
    const bucketName = FLEET_DOCUMENTS_BUCKET;

    console.log("Target Storage Bucket:", bucketName);

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (error) {
    return {
      url: null,
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}
