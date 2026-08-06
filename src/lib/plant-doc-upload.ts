import { supabase } from "./supabase";

export const PLANT_IMAGES_BUCKET = "plant-images";

export async function uploadPlantFile(
  file: File,
  path: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const ext = file.name.split(".").pop() ?? "pdf";
    const fullPath = path.includes(".") ? path : `${path}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(PLANT_IMAGES_BUCKET)
      .upload(fullPath, file, {
        upsert: true,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = supabase.storage.from(PLANT_IMAGES_BUCKET).getPublicUrl(fullPath);
    return { url: data.publicUrl, error: null };
  } catch (err) {
    return {
      url: null,
      error: err instanceof Error ? err.message : "Upload failed",
    };
  }
}

export async function uploadPlantFileSafe(
  file: File | null | undefined,
  path: string
): Promise<string | null> {
  if (!file) return null;
  const { url, error } = await uploadPlantFile(file, path);
  if (error) {
    console.warn(`Plant file upload failed (${path}):`, error);
    return null;
  }
  return url;
}
