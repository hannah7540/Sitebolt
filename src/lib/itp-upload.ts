import { supabase } from "./supabase";

const BUCKET = "itp-uploads";

export async function uploadItpFile(
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

export async function uploadItpPhoto(
  file: File,
  itpId: string,
  itemId: string
): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${itpId}/${itemId}/photo-${Date.now()}.${ext}`;
  const { url, error } = await uploadItpFile(file, path, file.type);
  if (error) {
    console.warn("ITP photo upload failed:", error);
    return null;
  }
  return url;
}

export async function uploadItpSignature(
  dataUrl: string,
  itpId: string,
  itemId: string
): Promise<string | null> {
  try {
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const path = `${itpId}/${itemId}/signature-${Date.now()}.png`;
    const { url, error } = await uploadItpFile(blob, path, "image/png");
    if (error) {
      console.warn("ITP signature upload failed:", error);
      return null;
    }
    return url;
  } catch (err) {
    console.warn("ITP signature upload failed:", err);
    return null;
  }
}
