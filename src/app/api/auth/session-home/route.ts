import { NextResponse } from "next/server";
import {
  authUserLooksLikeSubcontractor,
  lookupSubcontractorIdForAuthUser,
} from "@/lib/subcontractor-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { matchWorkerForAuthUser } from "@/lib/worker-auth-lookup";
import {
  SUBCONTRACTOR_PORTAL_HOME_PATH,
  resolveDefaultLandingPathForRole,
} from "@/lib/user-session";
import { toRelativeAppPath } from "@/lib/relative-app-path";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({
      homePath: "/login",
      workerId: null,
      subcontractorId: null,
      role: null,
    });
  }

  const worker = await matchWorkerForAuthUser(supabase, user);
  const workerId = worker?.workerId ?? null;

  const lookupClient = isSupabaseAdminConfigured()
    ? createSupabaseAdminClient()
    : supabase;
  const subcontractorId = await lookupSubcontractorIdForAuthUser(lookupClient, user);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, worker_id")
    .eq("id", user.id)
    .maybeSingle();

  const role =
    worker?.securityRole ??
    (typeof profile?.role === "string" ? profile.role : null);

  const resolvedWorkerId =
    workerId ??
    (typeof profile?.worker_id === "string" ? profile.worker_id : null);

  let homePath = resolveDefaultLandingPathForRole(
    role,
    resolvedWorkerId,
    subcontractorId
  );

  if (
    !resolvedWorkerId &&
    (subcontractorId || authUserLooksLikeSubcontractor(user, subcontractorId))
  ) {
    homePath = SUBCONTRACTOR_PORTAL_HOME_PATH;
  }

  return NextResponse.json({
    homePath: toRelativeAppPath(homePath, SUBCONTRACTOR_PORTAL_HOME_PATH),
    workerId: resolvedWorkerId,
    subcontractorId,
    role,
  });
}
