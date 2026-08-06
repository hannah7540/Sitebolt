import { supabase } from "./supabase";

export const WORKER_IMAGES_BUCKET = "worker-images";

export interface UploadImageOptions {
  bucket?: string;
  isBase64?: boolean;
  contentType?: string;
}

function base64DataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  if (!base64) {
    throw new Error("Invalid base64 data URL.");
  }
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export async function uploadImageAndGetUrl(
  source: File | Blob | string,
  path: string,
  options: UploadImageOptions = {}
): Promise<{ url: string | null; error: string | null }> {
  const bucket = options.bucket ?? WORKER_IMAGES_BUCKET;

  try {
    let file: File | Blob;
    let contentType = options.contentType;

    if (options.isBase64) {
      if (typeof source !== "string") {
        return { url: null, error: "Base64 upload requires a data URL string." };
      }
      file = base64DataUrlToBlob(source);
      contentType = contentType ?? file.type ?? "image/jpeg";
    } else if (source instanceof File || source instanceof Blob) {
      file = source;
      contentType =
        contentType ??
        (source instanceof File ? source.type : undefined) ??
        "image/jpeg";
    } else {
      return { url: null, error: "Invalid upload source." };
    }

    let ext = "jpg";
    if (!options.isBase64 && source instanceof File) {
      ext = source.name.split(".").pop()?.toLowerCase() || "jpg";
    }

    const fullPath = path.includes(".") ? path : `${path}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fullPath, file, {
        upsert: true,
        contentType: contentType || undefined,
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(fullPath);
    return { url: data.publicUrl, error: null };
  } catch (err) {
    return {
      url: null,
      error: err instanceof Error ? err.message : "Upload failed",
    };
  }
}
