import { supabase } from "./supabase";

export const ORGANISATION_LOGO_BUCKET = "organisation-logos";
const MAX_LOGO_SIZE_BYTES = 10 * 1024 * 1024;

export function isAllowedCompanyLogoFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const lowerName = file.name.toLowerCase();
  return [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"].some((ext) =>
    lowerName.endsWith(ext)
  );
}

export function validateOrganisationLogoFile(file: File): string | null {
  if (!isAllowedCompanyLogoFile(file)) {
    return "Please upload a valid image file.";
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return "Logo must be smaller than 10MB.";
  }
  return null;
}

export async function uploadOrganisationLogo(file: File): Promise<{
  url: string | null;
  error: string | null;
}> {
  const validationError = validateOrganisationLogoFile(file);
  if (validationError) {
    return { url: null, error: validationError };
  }

  const fileExt = file.name.split(".").pop()?.toLowerCase() || "png";
  const fileName = `logo-${Date.now()}.${fileExt}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from(ORGANISATION_LOGO_BUCKET)
      .upload(fileName, file, {
        upsert: true,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = supabase.storage.from(ORGANISATION_LOGO_BUCKET).getPublicUrl(fileName);
    return { url: data.publicUrl, error: null };
  } catch (err) {
    return {
      url: null,
      error: err instanceof Error ? err.message : "Logo upload failed",
    };
  }
}

/** @deprecated Use uploadOrganisationLogo instead. */
export async function uploadCompanyLogo(
  file: File,
  _path: string
): Promise<{ url: string | null; error: string | null }> {
  return uploadOrganisationLogo(file);
}
