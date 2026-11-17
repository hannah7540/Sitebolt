"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import type { ChecklistResult } from "@/components/itc/admin/itp-itc-admin-api";

export interface ChecklistStepActorStamp {
  completed_by_name: string | null;
  completed_at: string | null;
  error: string | null;
}

/**
 * Resolve the authenticated user who is toggling an ITC checklist step.
 * When the step is marked complete (`yes`), returns name + timestamp to inject
 * into that step's JSON object. Clearing / NA / NO clears the audit fields.
 */
export async function stampItcChecklistStepActor(
  result: ChecklistResult
): Promise<ChecklistStepActorStamp> {
  if (!result || result !== "yes") {
    return { completed_by_name: null, completed_at: null, error: null };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError) {
      return {
        completed_by_name: null,
        completed_at: new Date().toISOString(),
        error: authError.message,
      };
    }
    if (!user) {
      return {
        completed_by_name: null,
        completed_at: new Date().toISOString(),
        error: "Not authenticated.",
      };
    }

    const { data: worker } = await supabase
      .from("workers")
      .select("id, first_name, last_name, email, full_name, worker_name, name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const displayName = worker
      ? getWorkerDisplayName(worker)
      : user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email ||
        "Signed-in user";

    return {
      completed_by_name: String(displayName).trim() || "Signed-in user",
      completed_at: new Date().toISOString(),
      error: null,
    };
  } catch (cause) {
    return {
      completed_by_name: null,
      completed_at: new Date().toISOString(),
      error: cause instanceof Error ? cause.message : "Failed to resolve user",
    };
  }
}

/**
 * Toggle helper used by the ITC checklist UI — stamps the current authenticated
 * actor onto the step when it is marked complete.
 */
export async function toggleItcChecklistStepActor(input: {
  result: ChecklistResult;
  fallbackName?: string | null;
}): Promise<ChecklistStepActorStamp> {
  const stamped = await stampItcChecklistStepActor(input.result);
  if (stamped.completed_by_name || input.result !== "yes") {
    return stamped;
  }
  const fallback = input.fallbackName?.trim();
  return {
    completed_by_name: fallback || "Signed-in user",
    completed_at: stamped.completed_at ?? new Date().toISOString(),
    error: stamped.error,
  };
}
