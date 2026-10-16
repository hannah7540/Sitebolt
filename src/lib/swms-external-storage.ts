import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EXTERNAL_SWMS_SIGNED_URL_SECONDS,
  SWMS_DOCUMENTS_BUCKET,
  normalizeSwmsStoragePath,
} from "@/lib/swms-external";

export async function createSwmsStorageSignedUrlWithClient(
  admin: SupabaseClient,
  storagePath: string
): Promise<string> {
  const path = normalizeSwmsStoragePath(storagePath);
  if (!path) return "";

  const { data, error } = await admin.storage
    .from(SWMS_DOCUMENTS_BUCKET)
    .createSignedUrl(path, EXTERNAL_SWMS_SIGNED_URL_SECONDS);
  if (!error && data?.signedUrl) return data.signedUrl;

  const { data: pub } = admin.storage.from(SWMS_DOCUMENTS_BUCKET).getPublicUrl(path);
  return pub.publicUrl || "";
}
