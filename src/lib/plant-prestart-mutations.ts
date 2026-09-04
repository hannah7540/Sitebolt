import { supabase, isSupabaseConfigured, type PlantPrestart } from "./supabase";
import {
  isSupabaseMissingColumnError,
  toSupabaseRequestError,
} from "./supabase-errors";

export function isPlantPrestartUnread(prestart: PlantPrestart): boolean {
  if (prestart.is_read === true) return false;
  if (prestart.read_at) return false;
  return true;
}

export function isPlantPrestartRecent(
  prestart: PlantPrestart,
  withinDays = 7
): boolean {
  const submitted = prestart.submitted_at || prestart.created_at;
  const time = submitted ? new Date(submitted).getTime() : NaN;
  if (Number.isNaN(time)) return true;
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  return time >= cutoff;
}

export async function markPlantPrestartRead(
  prestartId: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const readAt = new Date().toISOString();
  const { error } = await supabase
    .from("plant_prestarts")
    .update({
      is_read: true,
      read_at: readAt,
    })
    .eq("id", prestartId);

  if (!error) return { error: null };

  if (isSupabaseMissingColumnError(error)) {
    return { error: null };
  }

  return {
    error: toSupabaseRequestError(error)?.message ?? error.message,
  };
}
