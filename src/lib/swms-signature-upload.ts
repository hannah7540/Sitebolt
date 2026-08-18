import { supabase } from "./supabase";

const SIGNATURE_BUCKETS = ["signatures", "site-form-uploads"] as const;

export function sanitizeSignatureKey(token: string): string {
  const safeToken = token.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
  return `swms/signatures/${safeToken || Date.now()}.png`;
}

async function uploadSignatureToBucket(
  bucket: string,
  file: File,
  path: string
): Promise<{ url: string | null; error: string | null }> {
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      upsert: true,
      contentType: "image/png",
      cacheControl: "3600",
    });

  if (uploadError) {
    return { url: null, error: uploadError.message };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export async function uploadSwmsSignature(
  dataUrl: string,
  signingToken: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const blob = await fetch(dataUrl).then((response) => response.blob());
    const file = new File([blob], "signature.png", { type: "image/png" });
    const path = sanitizeSignatureKey(signingToken);
    const errors: string[] = [];

    for (const bucket of SIGNATURE_BUCKETS) {
      const { url, error } = await uploadSignatureToBucket(bucket, file, path);
      if (url) return { url, error: null };
      if (error) errors.push(`${bucket}: ${error}`);
    }

    return {
      url: null,
      error: errors.length > 0 ? errors.join(" | ") : "Signature upload failed.",
    };
  } catch (error) {
    return {
      url: null,
      error: error instanceof Error ? error.message : "Signature upload failed.",
    };
  }
}
