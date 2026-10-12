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

  type TargetWorkerRow = {
    id: string;
    auth_user_id?: string | null;
    worker_category?: string | null;
  };
  const initialTarget = await admin
    .from("workers")
    .select("id, auth_user_id, worker_category")
    .eq("id", workerId)
    .maybeSingle();
  let targetError = initialTarget.error;
  let targetWorker = (initialTarget.data ?? null) as TargetWorkerRow | null;

  if (targetError && /worker_category/i.test(targetError.message)) {
    const retry = await admin
      .from("workers")
      .select("id, auth_user_id")
      .eq("id", workerId)
      .maybeSingle();
    targetError = retry.error;
    targetWorker = (retry.data ?? null) as TargetWorkerRow | null;
  }

  if (targetError) {
    return NextResponse.json({ error: targetError.message }, { status: 400 });
  }

  if (!targetWorker?.id) {
    return NextResponse.json({ error: "Worker not found." }, { status: 404 });
  }

  if (
    String((targetWorker as { worker_category?: string | null }).worker_category ?? "")
      .trim()
      .toLowerCase() === "hired_labour"
  ) {
    return NextResponse.json({
      success: true,
      templateId: null,
      templateName: null,
    });
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

  return NextResponse.json({
    success: true,
    templateId: result.templateId,
    templateName: result.templateName ?? templateName,
  });
}
