export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { applyWorkerInductionWorkflowRulesAdmin } from "@/lib/worker-induction-auto-assign";
import { canAssignPayRules, normalizeSecurityRole } from "@/lib/security-roles";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

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
    body && typeof body === "object" ? readString((body as Record<string, unknown>).workerId) : "";
  const state =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).state === "string"
      ? String((body as Record<string, unknown>).state).trim()
      : null;
  const includeExistingProjects =
    body &&
    typeof body === "object" &&
    (body as Record<string, unknown>).includeExistingProjects === true;
  const syncCompanyFromWorkerState =
    body &&
    typeof body === "object" &&
    (body as Record<string, unknown>).syncCompanyFromWorkerState === true;
  const applyCompanyRules =
    body &&
    typeof body === "object" &&
    (body as Record<string, unknown>).applyCompanyRules === true;

  const rawProjectIds =
    body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).projectIds)
      ? ((body as Record<string, unknown>).projectIds as unknown[])
      : [];
  const projectIds = rawProjectIds
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean);

  const rawNames =
    body &&
    typeof body === "object" &&
    (body as Record<string, unknown>).projectNames &&
    typeof (body as Record<string, unknown>).projectNames === "object"
      ? ((body as Record<string, unknown>).projectNames as Record<string, unknown>)
      : {};
  const projectNames: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(rawNames)) {
    projectNames[key] = typeof value === "string" ? value : null;
  }

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

  const result = await applyWorkerInductionWorkflowRulesAdmin(admin, workerId, {
    state: applyCompanyRules || state !== null ? state : undefined,
    syncCompanyFromWorkerState,
    projectIds,
    projectNames,
    includeExistingProjects,
  });

  return NextResponse.json({
    success: true,
    companyAssigned: result.companyAssigned,
    projectAssigned: result.projectAssigned,
    skipped: result.skipped,
    warnings: result.warnings,
  });
}
