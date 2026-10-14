"use server";

import { revalidatePath } from "next/cache";
import { markWorkerProfileAlertReviewed } from "@/lib/worker-profile-alerts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function reviewWorkerProfileAlert(
  alertId: string
): Promise<{ error: string | null }> {
  if (!isSupabaseAdminConfigured()) {
    return { error: "Server configuration error." };
  }

  const session = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await session.auth.getUser();
  if (authError) return { error: authError.message };
  if (!user) return { error: "Not authenticated." };

  const admin = createSupabaseAdminClient();
  const result = await markWorkerProfileAlertReviewed(admin, alertId);
  if (result.error) return result;

  revalidatePath("/organisation/alerts");
  revalidatePath("/organisation");
  return { error: null };
}
