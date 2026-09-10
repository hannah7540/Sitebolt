import {
  supabase,
  isSupabaseConfigured,
  resolvePlantPrestartDefect,
  type PlantPrestart,
} from "./supabase";
import {
  isSupabaseMissingColumnError,
  toSupabaseRequestError,
} from "./supabase-errors";
import { applyResolvedPrestartPatch } from "./plant-prestart-utils";

export function isPlantPrestartUnread(prestart: PlantPrestart): boolean {
  if (prestart.is_read === true) return false;
  if (prestart.read_at) return false;
  if (prestart.defect_reviewed === true) return false;
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

async function currentAuthUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function updatePlantPrestartWithFallback(
  prestartId: string,
  payloads: Record<string, unknown>[]
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  let lastError: string | null = null;
  for (const payload of payloads) {
    const { error } = await supabase
      .from("plant_prestarts")
      .update(payload)
      .eq("id", prestartId);

    if (!error) return { error: null };
    lastError = toSupabaseRequestError(error)?.message ?? error.message;
    if (!isSupabaseMissingColumnError(error)) {
      return { error: lastError };
    }
  }

  return { error: lastError };
}

export async function markPlantPrestartRead(
  prestartId: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const readAt = new Date().toISOString();
  const acknowledgedBy = await currentAuthUserId();
  return updatePlantPrestartWithFallback(prestartId, [
    {
      is_read: true,
      read_at: readAt,
      defect_reviewed: true,
      acknowledged_at: readAt,
      acknowledged_by: acknowledgedBy,
    },
    {
      is_read: true,
      read_at: readAt,
    },
  ]);
}

export async function markPlantPrestartDefectRead(
  prestartId: string
): Promise<{ error: string | null }> {
  return markPlantPrestartRead(prestartId);
}

export async function ignorePlantPrestartDefect(input: {
  plantId: string;
  prestartId: string;
}): Promise<{ error: string | null; prestart?: PlantPrestart }> {
  const acknowledgedAt = new Date().toISOString();
  const acknowledgedBy = await currentAuthUserId();

  const resolveResult = await resolvePlantPrestartDefect({
    plantId: input.plantId,
    prestartId: input.prestartId,
    resolutionNotes: "Ignored from dashboard",
    requireNotes: false,
  });

  if (resolveResult.error) {
    return { error: resolveResult.error };
  }

  const reviewResult = await updatePlantPrestartWithFallback(input.prestartId, [
    {
      defect_reviewed: true,
      defect_ignored: true,
      has_defect: false,
      acknowledged_at: acknowledgedAt,
      acknowledged_by: acknowledgedBy,
      is_read: true,
      read_at: acknowledgedAt,
    },
    {
      has_defect: false,
      is_read: true,
      read_at: acknowledgedAt,
    },
  ]);

  if (reviewResult.error) {
    return { error: reviewResult.error };
  }

  return {
    error: null,
    prestart: applyResolvedPrestartPatch(
      {
        id: input.prestartId,
        plant_id: input.plantId,
        operator_name: "",
        project_id: null,
        current_reading: null,
        next_service_due: null,
        check_data: {},
        has_defect: false,
        defect_comments: null,
        defect_photo_url: null,
        signature_url: null,
        repair_notes: "Ignored from dashboard",
        mechanic_invoice_ref: null,
        cleared_at: acknowledgedAt,
        created_at: acknowledgedAt,
        defect_reviewed: true,
        defect_ignored: true,
        acknowledged_at: acknowledgedAt,
        acknowledged_by: acknowledgedBy,
        is_read: true,
        read_at: acknowledgedAt,
      },
      "Ignored from dashboard"
    ),
  };
}
