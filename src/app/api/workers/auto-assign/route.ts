export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { applyAutomaticWorkerAssignments } from "@/lib/services/worker-assignment";
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
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const workerId = readString(record.workerId);
  const state = typeof record.state === "string" ? record.state.trim() : null;
  const includeExistingProjects = record.includeExistingProjects === true;
  const syncCompanyFromWorkerState = record.syncCompanyFromWorkerState === true;
  const assignCompanySwms = record.assignCompanySwms === true;

  const projectIds = Array.isArray(record.projectIds)
    ? record.projectIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    : [];

  const projectNames: Record<string, string | null> = {};
  if (record.projectNames && typeof record.projectNames === "object") {
    for (const [key, value] of Object.entries(
      record.projectNames as Record<string, unknown>
    )) {
      projectNames[key] = typeof value === "string" ? value : null;
    }
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

  const result = await applyAutomaticWorkerAssignments(admin, {
    workerId,
    state: state || (syncCompanyFromWorkerState ? undefined : null),
    syncCompanyFromWorkerState,
    projectIds,
    projectNames,
    includeExistingProjects,
    assignCompanySwms,
  });

  return NextResponse.json({
    success: true,
    inductions: result.inductions,
    swms: result.swms,
  });
}
