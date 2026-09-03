import { supabase } from "./supabase";

export const PLANT_IMAGES_BUCKET = "plant-images";
export const PLANT_DOCUMENTS_BUCKET = "plant-documents";

const REGISTRATION_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"] as const;
const REGISTRATION_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

function sanitizeStorageFileName(name: string): string {
  const trimmed = name.trim() || "document";
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function isAllowedRegistrationFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = REGISTRATION_EXTENSIONS.some((ext) =>
    lowerName.endsWith(ext)
  );
  const hasAllowedType = !file.type || REGISTRATION_MIME_TYPES.has(file.type);
  return hasAllowedExtension && hasAllowedType;
}

export async function uploadPlantRegistrationDocument(
  file: File
): Promise<{ url: string | null; error: string | null }> {
  if (!isAllowedRegistrationFile(file)) {
    return {
      url: null,
      error: "Registration document must be a PDF, PNG, or JPG file.",
    };
  }

  const path = `registration/${Date.now()}_${sanitizeStorageFileName(file.name)}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from(PLANT_DOCUMENTS_BUCKET)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = supabase.storage
      .from(PLANT_DOCUMENTS_BUCKET)
      .getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (err) {
    return {
      url: null,
      error: err instanceof Error ? err.message : "Upload failed",
    };
  }
}

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
