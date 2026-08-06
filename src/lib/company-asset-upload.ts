import { supabase } from "./supabase";

const BUCKET = "company-assets";

const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
]);

const ALLOWED_LOGO_EXTENSIONS = [".png", ".jpg", ".jpeg", ".svg"];

export function isAllowedCompanyLogoFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  if (ALLOWED_LOGO_TYPES.has(file.type)) return true;
  return ALLOWED_LOGO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

export async function uploadCompanyLogo(
  file: File,
  path: string
): Promise<{ url: string | null; error: string | null }> {
  if (!isAllowedCompanyLogoFile(file)) {
    return {
      url: null,
      error: "Logo must be a PNG, JPG, or SVG image.",
    };
  }

  try {
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const fullPath = path.includes(".") ? path : `${path}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fullPath, file, {
        upsert: true,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(fullPath);
    return { url: data.publicUrl, error: null };
  } catch (err) {
    return {
      url: null,
      error: err instanceof Error ? err.message : "Logo upload failed",
    };
  }
}
