import { supabase } from "./supabase";

const WORKER_DOCS_BUCKET = "worker-docs";

function resolveWorkerDocStoragePath(path: string, file: File): string {
  const extFromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  const safeExt = /^[a-z0-9]{1,8}$/.test(extFromName) ? extFromName : "jpg";
  const cleaned = path.replace(/^\/+|\/+$/g, "");
  const slash = cleaned.lastIndexOf("/");
  const dir = slash >= 0 ? cleaned.slice(0, slash) : "";
  const last = slash >= 0 ? cleaned.slice(slash + 1) : cleaned;
  const base = last.includes(".") ? last.slice(0, last.lastIndexOf(".")) : last;
  const uniqueName = `${base || "document"}-${Date.now()}.${safeExt}`;
  return dir ? `${dir}/${uniqueName}` : uniqueName;
}

function resolveWorkerDocContentType(file: File, storagePath: string): string {
  if (file.type) return file.type;
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "jpg";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export async function uploadWorkerDocument(
  file: File,
  path: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const fullPath = resolveWorkerDocStoragePath(path, file);

    const { error: uploadError } = await supabase.storage
      .from(WORKER_DOCS_BUCKET)
      .upload(fullPath, file, {
        upsert: false,
        contentType: resolveWorkerDocContentType(file, fullPath),
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = supabase.storage.from(WORKER_DOCS_BUCKET).getPublicUrl(fullPath);
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
