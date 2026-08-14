export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  assignDefaultPayRuleToWorkerAdmin,
  resolvePayRuleTemplateNameForWorker,
} from "@/lib/worker-pay-rule-assignment";
import { canAssignPayRules, normalizeSecurityRole } from "@/lib/security-roles";

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const workerId =
    body && typeof body === "object" && typeof body.workerId === "string"
      ? body.workerId.trim()
      : "";
  const state =
    body && typeof body === "object" && typeof body.state === "string"
      ? body.state.trim()
      : null;

  if (!workerId) {
    return NextResponse.json({ error: "workerId is required." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: targetWorker, error: targetError } = await admin
    .from("workers")
    .select("id, auth_user_id")
    .eq("id", workerId)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 400 });
  }

  if (!targetWorker?.id) {
    return NextResponse.json({ error: "Worker not found." }, { status: 404 });
  }

  const isSelf = targetWorker.auth_user_id === user.id;

  let canManageOthers = false;
  if (!isSelf) {
    const { data: callerWorker } = await admin
      .from("workers")
      .select("security_role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    canManageOthers = canAssignPayRules(
      normalizeSecurityRole(
        callerWorker?.security_role && typeof callerWorker.security_role === "string"
          ? callerWorker.security_role
          : null
      )
    );
  }

  if (!isSelf && !canManageOthers) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const templateName = resolvePayRuleTemplateNameForWorker(state);
  const result = await assignDefaultPayRuleToWorkerAdmin(admin, workerId, state);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    templateId: result.templateId,
    templateName: result.templateName ?? templateName,
  });
}
