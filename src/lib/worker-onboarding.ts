import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { WorkerOnboardingRecord } from "@/lib/worker-onboarding-types";
import { matchWorkerForAuthUser } from "@/lib/worker-auth-lookup";

export type { WorkerOnboardingFormPayload, WorkerOnboardingRecord } from "@/lib/worker-onboarding-types";

export const WORKER_ONBOARDING_PATH = "/onboarding";

export async function findWorkerIdForAuthUser(
  supabase: SupabaseClient,
  userId: string,
  email: string | null | undefined
): Promise<string | null> {
  const profileLookup = await supabase
    .from("profiles")
    .select("worker_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profileLookup.error && profileLookup.data?.worker_id) {
    return profileLookup.data.worker_id as string;
  }

  const match = await matchWorkerForAuthUser(supabase, { id: userId, email });
  return match?.workerId ?? null;
}

export async function fetchWorkerOnboardingCompleted(
  workerId: string
): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  const selectVariants = [
    "onboarding_completed",
    "status, induction_completed_at",
  ] as const;

  for (const select of selectVariants) {
    const { data, error } = await supabase
      .from("workers")
      .select(select)
      .eq("id", workerId)
      .maybeSingle();

    if (error) {
      if (error.message.toLowerCase().includes("onboarding_completed")) continue;
      return false;
    }

    if (!data) return false;

    const row = data as {
      onboarding_completed?: boolean | null;
      status?: string | null;
      induction_completed_at?: string | null;
    };

    if (typeof row.onboarding_completed === "boolean") {
      return row.onboarding_completed;
    }

    return row.status === "active" || Boolean(row.induction_completed_at);
  }

  return false;
}
