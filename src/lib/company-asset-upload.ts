import { supabase } from "./supabase";

const PRIMARY_BUCKET = "organisation-logos";
const FALLBACK_BUCKET = "company-assets";
const MAX_LOGO_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/webp",
  "image/gif",
]);

const ALLOWED_LOGO_EXTENSIONS = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"];

export function isAllowedCompanyLogoFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const lowerName = file.name.toLowerCase();
  if (ALLOWED_LOGO_TYPES.has(file.type)) return true;
  return ALLOWED_LOGO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

export function validateOrganisationLogoFile(file: File): string | null {
  if (!isAllowedCompanyLogoFile(file)) {
    return "Please upload a valid image file (PNG, JPG, SVG, WEBP, or GIF).";
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return "Logo must be smaller than 10MB.";
  }
  return null;
}

function isMissingBucketError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("bucket") && (lower.includes("not found") || lower.includes("does not exist"));
}

async function uploadToBucket(
  bucket: string,
  fileName: string,
  file: File
): Promise<{ url: string | null; error: string | null }> {
  const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, file, {
    upsert: true,
    contentType: file.type || undefined,
  });

  if (uploadError) {
    return { url: null, error: uploadError.message };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return { url: data.publicUrl, error: null };
}

export async function uploadOrganisationLogo(file: File): Promise<{
  url: string | null;
  error: string | null;
  bucket: string | null;
}> {
  const validationError = validateOrganisationLogoFile(file);
  if (validationError) {
    return { url: null, error: validationError, bucket: null };
  }

  const fileExt = file.name.split(".").pop()?.toLowerCase() || "png";
  const fileName = `logo-${Date.now()}.${fileExt}`;

  const primaryUpload = await uploadToBucket(PRIMARY_BUCKET, fileName, file);
  if (!primaryUpload.error && primaryUpload.url) {
    return { url: primaryUpload.url, error: null, bucket: PRIMARY_BUCKET };
  }

  if (primaryUpload.error && !isMissingBucketError(primaryUpload.error)) {
    const fallbackUpload = await uploadToBucket(FALLBACK_BUCKET, `logos/${fileName}`, file);
    if (!fallbackUpload.error && fallbackUpload.url) {
      return { url: fallbackUpload.url, error: null, bucket: FALLBACK_BUCKET };
    }
    return {
      url: null,
      error: fallbackUpload.error ?? primaryUpload.error,
      bucket: null,
    };
  }

  const fallbackUpload = await uploadToBucket(FALLBACK_BUCKET, `logos/${fileName}`, file);
  if (!fallbackUpload.error && fallbackUpload.url) {
    return { url: fallbackUpload.url, error: null, bucket: FALLBACK_BUCKET };
  }

  return {
    url: null,
    error: fallbackUpload.error ?? primaryUpload.error ?? "Logo upload failed.",
    bucket: null,
  };
}

/** @deprecated Use uploadOrganisationLogo instead. */
export async function uploadCompanyLogo(
  file: File,
  path: string
): Promise<{ url: string | null; error: string | null }> {
  const direct = await uploadOrganisationLogo(file);
  if (direct.url) {
    return { url: direct.url, error: null };
  }

  if (!isAllowedCompanyLogoFile(file)) {
    return {
      url: null,
      error: "Logo must be a PNG, JPG, or SVG image.",
    };
  }

  try {
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const fullPath = path.includes(".") ? path : `${path}.${ext}`;
    return uploadToBucket(FALLBACK_BUCKET, fullPath, file);
  } catch (err) {
    return {
      url: null,
      error: err instanceof Error ? err.message : "Logo upload failed",
    };
  }
}

export { PRIMARY_BUCKET as ORGANISATION_LOGO_BUCKET, FALLBACK_BUCKET as COMPANY_ASSETS_BUCKET };
