export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { resolveActiveOrganisationIdFromCookies } from "@/lib/tenant-scope-server";
import {
  createAllEnabledFeatureFlags,
  parseOrganisationFeatureFlags,
} from "@/lib/organisation-feature-flags";

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({
      organisation_id: null,
      feature_flags: createAllEnabledFeatureFlags(),
    });
  }

  const server = await createSupabaseServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await resolveActiveOrganisationIdFromCookies();
  if (!orgId) {
    return NextResponse.json({
      organisation_id: null,
      feature_flags: createAllEnabledFeatureFlags(),
    });
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("organisations")
    .select("id, feature_flags")
    .eq("id", orgId)
    .maybeSingle();

  const flags = parseOrganisationFeatureFlags(
    (data as { feature_flags?: unknown } | null)?.feature_flags,
    orgId
  );

  return NextResponse.json({
    organisation_id: orgId,
    feature_flags: flags,
  });
}
