"use server";

import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE } from "@/lib/active-organisation";
import { syncPublicHolidaysForWorker } from "@/lib/public-holiday-sync";
import { canAccessAdminConsole, normalizeSecurityRole } from "@/lib/security-roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function syncPublicHolidaysForAllWorkers(): Promise<{
  workerCount: number;
  error: string | null;
}> {
  if (!isSupabaseAdminConfigured()) {
    return { workerCount: 0, error: "Server configuration error." };
  }

  const session = await createSupabaseServerClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return { workerCount: 0, error: "Not authenticated." };

  const cookieStore = await cookies();
  const orgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value?.trim() ?? "";
  if (!orgId) {
    return { workerCount: 0, error: "Select an organisation before syncing holidays." };
  }

  const admin = createSupabaseAdminClient();
  const { data: callers, error: callerError } = await admin
    .from("workers")
    .select("security_role")
    .eq("auth_user_id", user.id)
    .limit(5);
  if (callerError) return { workerCount: 0, error: callerError.message };
  const allowed = (callers ?? []).some((row) =>
    canAccessAdminConsole(
      normalizeSecurityRole((row as { security_role?: string | null }).security_role)
    )
  );
  if (!allowed) {
    return { workerCount: 0, error: "You do not have permission to sync holidays." };
  }

  let { data, error } = await admin
    .from("workers")
    .select("id")
    .eq("organisation_id", orgId)
    .is("deleted_at", null)
    .neq("status", "deleted")
    .limit(2000);
  if (error && /deleted_at/i.test(error.message)) {
    ({ data, error } = await admin
      .from("workers")
      .select("id")
      .eq("organisation_id", orgId)
      .neq("status", "deleted")
      .limit(2000));
  }
  if (error) return { workerCount: 0, error: error.message };

  const ids = (data ?? [])
    .map((row) => String((row as { id?: string }).id ?? "").trim())
    .filter(Boolean);

  let workerCount = 0;
  for (const id of ids) {
    const result = await syncPublicHolidaysForWorker(id, admin, orgId);
    if (!result.error) workerCount += 1;
  }

  return { workerCount, error: null };
}
