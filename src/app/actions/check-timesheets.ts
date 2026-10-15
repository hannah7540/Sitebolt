"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isOrganisationColumnMissing,
  withOrganisationScope,
} from "@/lib/tenant-scope";
import { resolveActiveOrganisationIdFromCookies } from "@/lib/tenant-scope-server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uniqueTimesheetIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => UUID_RE.test(id)))];
}

export async function checkTimesheets(
  ids: string[]
): Promise<{ error: string | null; updated: number }> {
  const uniqueIds = uniqueTimesheetIds(ids);
  if (uniqueIds.length === 0) {
    return { error: "No timesheets selected.", updated: 0 };
  }

  const orgId = await resolveActiveOrganisationIdFromCookies();
  if (!orgId) {
    return { error: "No active organisation selected.", updated: 0 };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "You must be signed in to mark timesheets as checked.", updated: 0 };
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    is_checked: true,
    checked_at: now,
    checked_by: user.id,
    updated_at: now,
  };

  const runUpdate = async (table: "worker_timesheets" | "timesheets") => {
    let query = supabase.from(table).update(payload).in("id", uniqueIds);
    query = withOrganisationScope(query, orgId);
    return query.select("id");
  };

  let { data, error } = await runUpdate("worker_timesheets");

  if (error && isOrganisationColumnMissing(error.message)) {
    const retry = await supabase
      .from("worker_timesheets")
      .update(payload)
      .in("id", uniqueIds)
      .select("id");
    data = retry.data;
    error = retry.error;
  }

  if (error && /updated_at/i.test(error.message)) {
    const withoutUpdated = {
      is_checked: true,
      checked_at: now,
      checked_by: user.id,
    };
    const retry = await supabase
      .from("worker_timesheets")
      .update(withoutUpdated)
      .in("id", uniqueIds)
      .select("id");
    data = retry.data;
    error = retry.error;
  }

  if (
    error &&
    (/timesheets/i.test(error.message) ||
      /does not exist/i.test(error.message) ||
      /schema cache/i.test(error.message) ||
      /could not find/i.test(error.message))
  ) {
    const fallback = await supabase
      .from("timesheets")
      .update({
        is_checked: true,
        checked_at: now,
        checked_by: user.id,
      })
      .in("id", uniqueIds)
      .select("id");
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return { error: error.message, updated: 0 };
  }

  revalidatePath("/accounts/timesheets");
  return { error: null, updated: data?.length ?? uniqueIds.length };
}
