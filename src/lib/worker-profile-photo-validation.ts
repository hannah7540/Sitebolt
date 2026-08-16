export const PROFILE_PHOTO_REQUIRED_MESSAGE =
  "Please upload a photo of yourself before continuing.";

export const PROFILE_PHOTO_API_REQUIRED_MESSAGE = "Profile photo is required";

export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

export const ALLOWED_PROFILE_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function validateProfilePhotoFile(file: File): string | null {
  if (!file.type.startsWith("image/") && !ALLOWED_PROFILE_PHOTO_TYPES.has(file.type)) {
    return "Please choose a JPG, PNG, or WebP image.";
  }
  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    return "Profile photo must be 5 MB or smaller.";
  }
  return null;
}

export function isValidProfilePhotoUrl(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("data:image/")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
