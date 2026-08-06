import { supabase } from "./supabase";

export async function uploadWorkerDocument(
  file: File,
  path: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const ext = file.name.split(".").pop() ?? "jpg";
    const fullPath = path.includes(".") ? path : `${path}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("worker-docs")
      .upload(fullPath, file, {
        upsert: true,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = supabase.storage.from("worker-docs").getPublicUrl(fullPath);
    return { url: data.publicUrl, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return { url: null, error: message };
  }
}

export async function uploadWorkerDocumentSafe(
  file: File | null | undefined,
  path: string
): Promise<string | null> {
  if (!file) return null;
  const { url, error } = await uploadWorkerDocument(file, path);
  if (error) {
    console.warn(`Worker doc upload failed (${path}):`, error);
    return null;
  }
  return url;
}

export async function uploadWorkerSignature(
  dataUrl: string,
  path: string
): Promise<string | null> {
  try {
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const file = new File([blob], "signature.png", { type: "image/png" });
    return uploadWorkerDocumentSafe(file, path);
  } catch (err) {
    console.warn("Signature upload failed:", err);
    return null;
  }
}
