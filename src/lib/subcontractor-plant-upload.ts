import { uploadSiteFormPhoto } from "./site-form-upload";

export async function uploadSubcontractorPlantDocumentSafe(
  file: File | null | undefined,
  path: string
): Promise<string | null> {
  if (!file) return null;
  return uploadSiteFormPhoto(file, path);
}
