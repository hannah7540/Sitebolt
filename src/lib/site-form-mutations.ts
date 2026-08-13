import { supabase, isSupabaseConfigured } from "./supabase";
import {
  isSupabaseMissingColumnError,
  toSupabaseRequestError,
} from "./supabase-errors";

/** Mark a site form as viewed on the project dashboard. */
export async function markSiteFormViewed(
  formId: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const viewedAt = new Date().toISOString();
  const columnPayload = {
    is_viewed: true,
    viewed_at: viewedAt,
  };

  const { error: columnError } = await supabase
    .from("site_forms")
    .update(columnPayload)
    .eq("id", formId);

  if (!columnError) {
    return { error: null };
  }

  if (!isSupabaseMissingColumnError(columnError)) {
    return { error: toSupabaseRequestError(columnError).message };
  }

  const { data: existing, error: fetchError } = await supabase
    .from("site_forms")
    .select("form_metadata")
    .eq("id", formId)
    .maybeSingle();

  if (fetchError) {
    return { error: toSupabaseRequestError(fetchError).message };
  }

  const currentMeta =
    existing?.form_metadata && typeof existing.form_metadata === "object"
      ? (existing.form_metadata as Record<string, unknown>)
      : {};

  const { error: metadataError } = await supabase
    .from("site_forms")
    .update({
      form_metadata: {
        ...currentMeta,
        is_viewed: true,
        viewed_at: viewedAt,
      },
    })
    .eq("id", formId);

  if (metadataError) {
    return { error: toSupabaseRequestError(metadataError).message };
  }

  return { error: null };
}
