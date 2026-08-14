export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { syncAllWorkersPayRuleTemplatesAdmin } from "@/lib/worker-pay-rule-assignment";
import { canAssignPayRules, normalizeSecurityRole } from "@/lib/security-roles";

/** Backfill workers.state → pay_rule_template_id for Accounts pay rules counts. */
export async function POST() {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ success: true, synced: 0, scanned: 0 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  const { data: callerWorker } = await admin
    .from("workers")
    .select("security_role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const role = normalizeSecurityRole(
    callerWorker?.security_role && typeof callerWorker.security_role === "string"
      ? callerWorker.security_role
      : null
  );

  if (!canAssignPayRules(role)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  try {
    const result = await syncAllWorkersPayRuleTemplatesAdmin(admin);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.warn("[api/pay-rules/sync-workers] Sync skipped:", err);
    return NextResponse.json({ success: true, synced: 0, scanned: 0 });
  }
}
