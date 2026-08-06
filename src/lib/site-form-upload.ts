import { supabase } from "./supabase";

const BUCKET = "site-form-uploads";

export async function uploadSiteFormFile(
  file: File | Blob,
  path: string,
  contentType?: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        upsert: true,
        contentType: contentType || (file instanceof File ? file.type : undefined),
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (err) {
    return {
      url: null,
      error: err instanceof Error ? err.message : "Upload failed",
    };
  }
}

export async function uploadSiteFormPhoto(
  file: File,
  path: string
): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fullPath = path.includes(".") ? path : `${path}.${ext}`;
  const { url, error } = await uploadSiteFormFile(file, fullPath, file.type);
  if (error) {
    console.warn(`Site form photo upload failed (${fullPath}):`, error);
    return null;
  }
  return url;
}

export async function uploadSiteFormSignature(
  dataUrl: string,
  path: string
): Promise<string | null> {
  try {
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const file = new File([blob], "signature.png", { type: "image/png" });
    const { url, error } = await uploadSiteFormFile(file, `${path}.png`, "image/png");
    if (error) {
      console.warn(`Site form signature upload failed (${path}):`, error);
      return null;
    }
    return url;
  } catch (err) {
    console.warn("Site form signature upload failed:", err);
    return null;
  }
}
